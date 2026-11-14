import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { splitAudio, splitImage, splitPdf, splitVideo } from './media.js';

const directories: string[] = [];
async function directory() {
  const result = await mkdtemp(join(tmpdir(), 'recall-split-'));
  directories.push(result);
  return result;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('media splitters', () => {
  it('normalizes images and produces a thumbnail', async () => {
    const dir = await directory();
    const input = join(dir, 'input.png');
    await sharp({ create: { width: 2400, height: 100, channels: 3, background: 'red' } })
      .png()
      .toFile(input);
    const [piece] = await splitImage(input, dir);
    expect((await sharp(piece.path).metadata()).width).toBe(2048);
    expect((await sharp(piece.thumbnail!).metadata()).format).toBe('jpeg');
  });
  it('makes single-page PDFs and thumbnails', async () => {
    const dir = await directory();
    const input = join(dir, 'input.pdf');
    const document = await PDFDocument.create();
    document.addPage();
    document.addPage();
    await writeFile(input, await document.save());
    const pieces = await splitPdf(input, dir);
    expect(pieces.map((piece) => piece.page)).toEqual([1, 2]);
    expect((await PDFDocument.load(await readFile(pieces[0].path))).getPageCount()).toBe(1);
    expect((await sharp(pieces[1].thumbnail!).metadata()).format).toBe('jpeg');
  });
  it('splits audio and retains time ranges', async () => {
    const dir = await directory();
    const input = join(dir, 'input.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2.2', input]);
    const pieces = await splitAudio(input, dir, 1);
    expect(pieces.map((piece) => piece.startSec)).toEqual([0, 1, 2]);
    expect(pieces[2].endSec).toBeCloseTo(2.2, 1);
  });
  it('normalizes video and writes a poster', async () => {
    const dir = await directory();
    const input = join(dir, 'input.mp4');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=128x96:d=1',
      '-c:v',
      'libx264',
      input,
    ]);
    const [piece] = await splitVideo(input, dir);
    expect(piece.endSec).toBeCloseTo(1, 1);
    expect((await sharp(piece.thumbnail!).metadata()).format).toBe('jpeg');
  });
});
