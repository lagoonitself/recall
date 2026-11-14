import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline as streamPipeline } from 'node:stream/promises';
import type pg from 'pg';
import type { Modality } from '@app/shared';
import type { LlmProvider, PieceDescription } from '../agent/provider/types.js';
import type { R2 } from '../lib/r2.js';
import type { embedMedia, embedText } from '../lib/embed.js';
import { filePrefix } from '../services/files.js';
import { describePieces, EMPTY_DESCRIPTION, type DescribeInput } from './describe.js';
import { extractAudioTrack, splitAudio, splitImage, splitPdf, splitVideo } from './splitters/media.js';
import { splitTextFile } from './splitters/text.js';

/** An error that retrying can't fix (bad input). The job fails at once instead of after 3 attempts. */
export class PermanentError extends Error {}

export type IngestDeps = {
  pool: pg.Pool;
  storage: R2;
  embedText: typeof embedText;
  embedMedia: typeof embedMedia;
  describer: { provider: LlmProvider; model: string };
  audioPieceSec: number;
  describeBatch: number;
};

type FileRow = {
  id: string;
  user_id: string;
  collection_id: string;
  mime_type: string;
  modality: Modality;
  r2_key: string;
};

/** One unit to store as a chunk. Text pieces carry their text; media pieces carry a path on disk. */
type Piece = {
  seq: number;
  modality: Modality;
  path: string;
  mimeType: string;
  ext: string;
  thumbnail?: string;
  audioTrack?: string;
  text?: string;
  page?: number;
  startSec?: number;
  endSec?: number;
  charStart?: number;
  charEnd?: number;
};

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
  'text/plain': 'txt',
};

async function split(file: FileRow, input: string, dir: string, audioPieceSec: number): Promise<Piece[]> {
  const media = (modality: Modality, list: Awaited<ReturnType<typeof splitImage>>) =>
    list.map((p, seq) => ({ ...p, seq, modality, ext: EXT[p.mimeType] ?? 'bin' }));
  try {
    switch (file.modality) {
      case 'text':
        return (await splitTextFile(input, file.mime_type, dir)).map((p, seq) => ({
          seq,
          modality: 'text' as const,
          path: p.path,
          mimeType: 'text/plain',
          ext: 'txt',
          text: p.text,
          charStart: p.charStart,
          charEnd: p.charEnd,
        }));
      case 'image':
        return media('image', await splitImage(input, dir));
      case 'pdf':
        return media('pdf', await splitPdf(input, dir));
      case 'audio':
        return media('audio', await splitAudio(input, dir, audioPieceSec));
      case 'video': {
        const pieces = media('video', await splitVideo(input, dir));
        const audioTrack = await extractAudioTrack(pieces[0].path, dir);
        return pieces.map((p) => ({ ...p, audioTrack }));
      }
    }
  } catch (error) {
    // Splitting fails on corrupt, password-protected or over-long files; retrying won't help.
    const message = error instanceof Error ? error.message : String(error);
    throw new PermanentError(`Could not read this file: ${message.slice(0, 200)}`);
  }
}

/**
 * Processes one file: download → split → for each piece store in R2, embed, describe, insert chunk.
 * Idempotent: chunks already stored (from an interrupted attempt) are skipped via UNIQUE (file_id, seq).
 * `shouldStop` is checked between batches so shutdown finishes the current piece and then releases the job.
 * Returns 'stopped' when interrupted, 'done' otherwise.
 */
export async function ingestFile(
  deps: IngestDeps,
  jobId: string | number,
  fileId: string,
  heartbeat: () => Promise<void>,
  shouldStop: () => boolean,
): Promise<'done' | 'stopped' | 'missing'> {
  const found = await deps.pool.query<FileRow>(
    'SELECT id, user_id, collection_id, mime_type, modality, r2_key FROM files WHERE id = $1',
    [fileId],
  );
  const file = found.rows[0];
  if (!file) return 'missing'; // Deleted while queued; cascade removed the job's purpose.
  await deps.pool.query(`UPDATE files SET status = 'processing', error = NULL WHERE id = $1`, [file.id]);

  const dir = join(tmpdir(), 'ingest', String(jobId));
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  try {
    const input = join(dir, 'original');
    // Stream to disk: never hold a whole upload in memory (512 MB instance).
    await streamPipeline(await deps.storage.getStream(file.r2_key), createWriteStream(input));
    const pieces = await split(file, input, dir, deps.audioPieceSec);
    if (!pieces.length) throw new PermanentError('This file has no content to index.');
    await deps.pool.query('UPDATE files SET pieces_total = $2 WHERE id = $1', [file.id, pieces.length]);

    const done = new Set(
      (
        await deps.pool.query<{ seq: number }>('SELECT seq FROM chunks WHERE file_id = $1', [file.id])
      ).rows.map((r) => r.seq),
    );
    const todo = pieces.filter((p) => !done.has(p.seq));
    const prefix = filePrefix(file.user_id, file.id);
    const batch = Math.max(1, deps.describeBatch);

    for (let start = 0; start < todo.length; start += batch) {
      if (shouldStop()) return 'stopped';
      await heartbeat();
      const group = todo.slice(start, start + batch);
      const describeInputs: DescribeInput[] = group.map((p) => ({
        modality: p.modality,
        path: p.path,
        mimeType: p.mimeType,
        thumbnail: p.thumbnail,
        audioTrack: p.audioTrack,
      }));
      const descriptions = await describePieces(deps.describer, describeInputs, batch);
      for (const [i, piece] of group.entries()) {
        await storePiece(deps, file, prefix, piece, descriptions[i] ?? EMPTY_DESCRIPTION);
        await deps.pool.query(
          'UPDATE files SET pieces_done = (SELECT count(*) FROM chunks WHERE file_id = $1) WHERE id = $1',
          [file.id],
        );
      }
    }
    await deps.pool.query(`UPDATE files SET status = 'ready', error = NULL WHERE id = $1`, [file.id]);
    return 'done';
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function storePiece(
  deps: IngestDeps,
  file: FileRow,
  prefix: string,
  piece: Piece,
  description: PieceDescription,
) {
  const key = `${prefix}pieces/${piece.seq}.${piece.ext}`;
  const thumbKey = piece.thumbnail ? `${prefix}thumbs/${piece.seq}.jpg` : null;
  const bytes = await readFile(piece.path);
  await deps.storage.put(
    key,
    bytes,
    piece.modality === 'text' ? 'text/plain; charset=utf-8' : piece.mimeType,
  );
  if (piece.thumbnail && thumbKey)
    await deps.storage.put(thumbKey, await readFile(piece.thumbnail), 'image/jpeg');

  const embedding =
    piece.modality === 'text'
      ? await deps.embedText(piece.text ?? '', 'document')
      : await deps.embedMedia({ mimeType: piece.mimeType, data: bytes });

  // Text pieces are not described (§4.3): their own text is the visible text.
  const d =
    piece.modality === 'text' ? { ...EMPTY_DESCRIPTION, visible_text: piece.text ?? '' } : description;
  await deps.pool.query(
    `INSERT INTO chunks (file_id, user_id, collection_id, modality, seq, page, start_sec, end_sec,
       char_start, char_end, r2_key, thumb_r2_key, summary, transcript, visible_text, tags, embedding)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::halfvec)
     ON CONFLICT (file_id, seq) DO NOTHING`,
    [
      file.id,
      file.user_id,
      file.collection_id,
      piece.modality,
      piece.seq,
      piece.page ?? null,
      piece.startSec ?? null,
      piece.endSec ?? null,
      piece.charStart ?? null,
      piece.charEnd ?? null,
      key,
      thumbKey,
      d.summary || null,
      d.transcript || null,
      d.visible_text || null,
      d.tags.length ? d.tags : null,
      `[${embedding.join(',')}]`,
    ],
  );
}
