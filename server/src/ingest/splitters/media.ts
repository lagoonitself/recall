import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

const run = promisify(execFile);

export interface MediaPiece {
  path: string;
  mimeType: string;
  thumbnail?: string;
  page?: number;
  startSec?: number;
  endSec?: number;
}

export async function splitImage(path: string, directory: string): Promise<MediaPiece[]> {
  const output = join(directory, 'piece-0.jpg');
  const thumbnail = join(directory, 'thumb-0.jpg');
  await sharp(path)
    .rotate()
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .jpeg()
    .toFile(output);
  await sharp(output).resize(480, 480, { fit: 'inside', withoutEnlargement: true }).jpeg().toFile(thumbnail);
  return [{ path: output, thumbnail, mimeType: 'image/jpeg' }];
}

export async function splitPdf(path: string, directory: string): Promise<MediaPiece[]> {
  const document = await PDFDocument.load(await readFile(path));
  const pieces: MediaPiece[] = [];
  for (let page = 1; page <= document.getPageCount(); page++) {
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(document, [page - 1]);
    single.addPage(copied);
    const output = join(directory, `piece-${page - 1}.pdf`);
    const prefix = join(directory, `thumb-${page - 1}`);
    await writeFile(output, await single.save());
    await run('pdftoppm', [
      '-jpeg',
      '-r',
      '72',
      '-f',
      String(page),
      '-l',
      String(page),
      '-singlefile',
      path,
      prefix,
    ]);
    pieces.push({ path: output, thumbnail: `${prefix}.jpg`, mimeType: 'application/pdf', page });
  }
  return pieces;
}

export async function probeDuration(path: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    path,
  ]);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not determine media duration');
  return duration;
}

export async function splitAudio(
  path: string,
  directory: string,
  pieceSeconds: number,
): Promise<MediaPiece[]> {
  if (!Number.isInteger(pieceSeconds) || pieceSeconds < 1 || pieceSeconds > 150)
    throw new Error('Invalid audio piece duration');
  const duration = await probeDuration(path);
  const pieces: MediaPiece[] = [];
  for (let start = 0; start < duration; start += pieceSeconds) {
    const end = Math.min(start + pieceSeconds, duration);
    const output = join(directory, `piece-${pieces.length}.mp3`);
    await run('ffmpeg', [
      '-v',
      'error',
      '-ss',
      String(start),
      '-i',
      path,
      '-t',
      String(end - start),
      '-vn',
      '-ac',
      '1',
      '-b:a',
      '64k',
      output,
    ]);
    pieces.push({ path: output, mimeType: 'audio/mpeg', startSec: start, endSec: end });
  }
  return pieces;
}

/** Mono MP3 of a video's audio track, or undefined when the video has no audio stream. */
export async function extractAudioTrack(path: string, directory: string): Promise<string | undefined> {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a',
    '-show_entries',
    'stream=index',
    '-of',
    'csv=p=0',
    path,
  ]);
  if (!stdout.trim()) return undefined;
  const output = join(directory, 'audio-track.mp3');
  await run('ffmpeg', ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-b:a', '64k', output]);
  return output;
}

export async function splitVideo(path: string, directory: string): Promise<MediaPiece[]> {
  const duration = await probeDuration(path);
  if (duration > 80) throw new Error('Video exceeds the 80 second limit');
  const output = join(directory, 'piece-0.mp4');
  const thumbnail = join(directory, 'thumb-0.jpg');
  await run('ffmpeg', [
    '-v',
    'error',
    '-i',
    path,
    '-vf',
    // Aspect-ratio adjustment can undo -2's even rounding (e.g. 640x360 -> 853x480).
    'scale=-2:480:force_original_aspect_ratio=decrease:force_divisible_by=2',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    output,
  ]);
  await run('ffmpeg', ['-v', 'error', '-i', output, '-frames:v', '1', thumbnail]);
  return [{ path: output, thumbnail, mimeType: 'video/mp4', startSec: 0, endSec: duration }];
}
