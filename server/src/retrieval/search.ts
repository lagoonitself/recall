import type { Location, Modality } from '@app/shared';
import type pg from 'pg';
import { getPool } from '../db/index.js';
import { embedMedia, embedText } from '../lib/embed.js';
import { splitAudio } from './audio.js';

export type SearchAttachment = { mimeType: string; data: Uint8Array };
export type SearchOptions = {
  userId: string;
  query?: string;
  attachment?: SearchAttachment;
  types?: Modality[];
  collectionId?: string;
  fileId?: string;
  limit?: number;
};
export type SearchResult = {
  chunkId: string;
  fileId: string;
  fileName: string;
  modality: Modality;
  location: Location;
  score: number;
  summary: string | null;
  thumbKey: string | null;
};
type Row = {
  id: string;
  file_id: string;
  file_name: string;
  modality: Modality;
  page: number | null;
  start_sec: number | null;
  end_sec: number | null;
  char_start: number | null;
  char_end: number | null;
  summary: string | null;
  thumb_r2_key: string | null;
};

export function fuseRanks(lists: Row[][], limit: number): SearchResult[] {
  const scores = new Map<string, { row: Row; score: number }>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.forEach((row, index) => {
      if (seen.has(row.id)) return;
      seen.add(row.id);
      const existing = scores.get(row.id);
      scores.set(row.id, { row, score: (existing?.score ?? 0) + 1 / (61 + index) });
    });
  }
  return [...scores.values()]
    .sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id))
    .slice(0, limit)
    .map(({ row, score }) => ({
      chunkId: row.id,
      fileId: row.file_id,
      fileName: row.file_name,
      modality: row.modality,
      location: {
        ...(row.page === null ? {} : { page: row.page }),
        ...(row.start_sec === null ? {} : { startSec: row.start_sec }),
        ...(row.end_sec === null ? {} : { endSec: row.end_sec }),
        ...(row.char_start === null ? {} : { charStart: row.char_start }),
        ...(row.char_end === null ? {} : { charEnd: row.char_end }),
      },
      score,
      summary: row.summary,
      thumbKey: row.thumb_r2_key,
    }));
}

const fields = `c.id, c.file_id, f.name AS file_name, c.modality, c.page, c.start_sec, c.end_sec,
  c.char_start, c.char_end, c.summary, c.thumb_r2_key`;
const scope = `c.user_id = $2 AND f.user_id = $2 AND ($3::uuid IS NULL OR c.collection_id = $3)
  AND ($4::text[] IS NULL OR c.modality = ANY($4)) AND ($5::uuid IS NULL OR c.file_id = $5)`;

export function createSearchLibrary(deps: {
  pool: pg.Pool;
  embedText: typeof embedText;
  embedMedia: typeof embedMedia;
  splitAudio: typeof splitAudio;
  audioPieceSec: number;
}) {
  return async function search(options: SearchOptions): Promise<SearchResult[]> {
    const limit = options.limit ?? 8;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error('limit must be between 1 and 100');
    const text = options.query?.trim();
    if (!text && !options.attachment) return [];
    const vectors: number[][] = [];
    if (text) vectors.push(await deps.embedText(text, 'query'));
    if (options.attachment) {
      const attachment = options.attachment;
      const pieces = attachment.mimeType.toLowerCase().startsWith('audio/')
        ? (await deps.splitAudio(attachment.data, deps.audioPieceSec)).map((data) => ({
            data,
            mimeType: 'audio/mpeg',
          }))
        : [attachment];
      for (const piece of pieces) vectors.push(await deps.embedMedia(piece));
    }
    const client = await deps.pool.connect();
    try {
      await client.query('BEGIN');
      const version = await client.query<{ extversion: string }>(
        `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
      );
      const [major, minor] = (version.rows[0]?.extversion ?? '0.0').split('.').map(Number);
      if (major < 1 && (major !== 0 || minor < 8))
        throw new Error('pgvector 0.8 or later is required for iterative HNSW scans');
      await client.query('SET LOCAL hnsw.ef_search = 100');
      await client.query('SET LOCAL hnsw.iterative_scan = relaxed_order');
      const filters = [
        options.userId,
        options.collectionId ?? null,
        options.types ?? null,
        options.fileId ?? null,
      ];
      const lists: Row[][] = [];
      for (const vector of vectors) {
        if (
          vector.length !== 1536 ||
          vector.some((value) => !Number.isFinite(value)) ||
          !vector.some((value) => value !== 0)
        )
          throw new Error('Query embedding must contain 1536 finite values and be nonzero');
        const result = await client.query<Row>(
          `WITH candidates AS MATERIALIZED (
          SELECT ${fields}, c.embedding <=> $1::halfvec AS distance
          FROM chunks c JOIN files f ON f.id = c.file_id
          WHERE ${scope} ORDER BY c.embedding <=> $1::halfvec LIMIT 30
        ) SELECT * FROM candidates ORDER BY distance + 0, id`,
          [`[${vector.join(',')}]`, ...filters],
        );
        lists.push(result.rows);
      }
      if (text) {
        const result = await client.query<Row>(
          `SELECT ${fields} FROM chunks c JOIN files f ON f.id = c.file_id,
          websearch_to_tsquery('english', $1) q WHERE ${scope} AND c.search_tsv @@ q
          ORDER BY ts_rank(c.search_tsv, q) DESC, c.id LIMIT 30`,
          [text, ...filters],
        );
        lists.push(result.rows);
      }
      await client.query('COMMIT');
      return fuseRanks(lists, limit);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
}

export async function searchLibrary(options: SearchOptions): Promise<SearchResult[]> {
  const audioPieceSec = Number(process.env.AUDIO_PIECE_SEC ?? 150);
  if (!Number.isInteger(audioPieceSec) || audioPieceSec < 1 || audioPieceSec > 150)
    throw new Error('AUDIO_PIECE_SEC must be an integer between 1 and 150');
  return createSearchLibrary({ pool: getPool(), embedText, embedMedia, splitAudio, audioPieceSec })(options);
}
