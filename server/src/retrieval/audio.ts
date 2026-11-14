import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function splitAudio(data: Uint8Array, seconds: number): Promise<Uint8Array[]> {
  if (data.byteLength > 15 * 1024 * 1024) throw new Error('Audio exceeds the inline size limit');
  const directory = await mkdtemp(join(tmpdir(), 'recall-audio-'));
  try {
    const input = join(directory, 'input');
    await writeFile(input, data);
    await run(
      'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        '-i',
        input,
        '-map',
        '0:a:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '64k',
        '-f',
        'segment',
        '-segment_time',
        String(seconds),
        '-reset_timestamps',
        '1',
        join(directory, 'piece-%05d.mp3'),
      ],
      { timeout: 120000 },
    );
    const names = (await readdir(directory)).filter((name) => /^piece-\d+\.mp3$/.test(name)).sort();
    if (!names.length) throw new Error('Audio contains no searchable segments');
    return await Promise.all(names.map((name) => readFile(join(directory, name))));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
