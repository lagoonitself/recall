import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LlmProvider, ModelCapabilities, PieceDescription } from '../agent/provider/types.js';
import { describePieces } from './describe.js';
import { backoffSeconds } from './worker.js';

const caps = (input: Partial<ModelCapabilities['input']>): ModelCapabilities => ({
  input: { image: false, pdf: false, audio: false, video: false, ...input },
  tools: true,
  reasoning: false,
  maxMediaPartsPerRequest: 1,
});
const desc = (summary: string, transcript = ''): PieceDescription => ({
  summary,
  transcript,
  visible_text: '',
  tags: [summary],
});

async function files() {
  const dir = await mkdtemp(join(tmpdir(), 'describe-test-'));
  const paths = {
    video: join(dir, 'v.mp4'),
    poster: join(dir, 'p.jpg'),
    audio: join(dir, 'a.mp3'),
    page: join(dir, 'x.pdf'),
  };
  for (const path of Object.values(paths)) await writeFile(path, 'x');
  return paths;
}

function provider(
  input: Partial<ModelCapabilities['input']>,
  reply: (types: string[]) => PieceDescription[],
) {
  const describeFn = vi.fn(async ({ pieces }: { pieces: { type: string }[] }) =>
    reply(pieces.map((p) => p.type)),
  );
  return {
    provider: { capabilities: () => caps(input), describe: describeFn } as unknown as LlmProvider,
    describeFn,
  };
}

describe('describePieces', () => {
  it('skips text, sends supported media directly and batches', async () => {
    const p = await files();
    const { provider: prov, describeFn } = provider({ image: true, video: true }, (types) =>
      types.map((t) => desc(t)),
    );
    const result = await describePieces(
      { provider: prov, model: 'm' },
      [
        { modality: 'text', path: p.page, mimeType: 'text/plain' },
        { modality: 'video', path: p.video, mimeType: 'video/mp4', thumbnail: p.poster },
        { modality: 'image', path: p.poster, mimeType: 'image/jpeg' },
      ],
      4,
    );
    expect(describeFn).toHaveBeenCalledTimes(1);
    expect(result.map((r) => r.summary)).toEqual(['', 'video', 'image']);
  });

  it('falls back to poster frame + audio track for video, and merges them', async () => {
    const p = await files();
    const { provider: prov } = provider({ image: true, audio: true }, (types) =>
      types.map((t) => (t === 'audio' ? desc('speech', 'hello there') : desc('a red room'))),
    );
    const [result] = await describePieces(
      { provider: prov, model: 'm' },
      [{ modality: 'video', path: p.video, mimeType: 'video/mp4', thumbnail: p.poster, audioTrack: p.audio }],
      1,
    );
    expect(result).toEqual({
      summary: 'a red room speech',
      transcript: 'hello there',
      visible_text: '',
      tags: ['a red room', 'speech'],
    });
  });

  it('uses the page image for a PDF when the model cannot read PDFs', async () => {
    const p = await files();
    const { provider: prov, describeFn } = provider({ image: true }, (types) => types.map((t) => desc(t)));
    const [result] = await describePieces(
      { provider: prov, model: 'm' },
      [{ modality: 'pdf', path: p.page, mimeType: 'application/pdf', thumbnail: p.poster }],
      1,
    );
    expect(describeFn.mock.calls[0][0].pieces[0].type).toBe('image');
    expect(result.summary).toBe('image');
  });

  it('stores an empty description when nothing fits or describe keeps failing', async () => {
    const p = await files();
    const none = provider({}, () => [desc('never')]);
    expect(
      await describePieces(
        { provider: none.provider, model: 'm' },
        [{ modality: 'audio', path: p.audio, mimeType: 'audio/mpeg' }],
        1,
      ),
    ).toEqual([{ summary: '', transcript: '', visible_text: '', tags: [] }]);
    expect(none.describeFn).not.toHaveBeenCalled();
    const failing = provider({ audio: true }, () => {
      throw new Error('bad json');
    });
    const [result] = await describePieces(
      { provider: failing.provider, model: 'm' },
      [{ modality: 'audio', path: p.audio, mimeType: 'audio/mpeg' }],
      1,
    );
    expect(failing.describeFn).toHaveBeenCalledTimes(2); // one retry
    expect(result.summary).toBe('');
  });
});

describe('backoff', () => {
  it('grows per attempt', () => {
    expect([1, 2, 3].map(backoffSeconds)).toEqual([30, 120, 480]);
  });
});
