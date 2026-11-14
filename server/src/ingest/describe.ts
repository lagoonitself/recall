import { readFile } from 'node:fs/promises';
import type { Modality } from '@app/shared';
import type { LlmProvider, MediaPart, PieceDescription } from '../agent/provider/types.js';

type MediaModality = MediaPart['type'];

export const EMPTY_DESCRIPTION: PieceDescription = {
  summary: '',
  transcript: '',
  visible_text: '',
  tags: [],
};

/** What the describe step may send for one piece, in order of preference (ARCHITECTURE §4.3). */
export type DescribeInput = {
  modality: Modality;
  path: string;
  mimeType: string;
  /** Poster frame or page image, used when the model can't take the piece itself. */
  thumbnail?: string;
  /** Audio track of a video, used for the transcript when the model can't take video. */
  audioTrack?: string;
};

type Describer = { provider: LlmProvider; model: string };

async function part(type: MediaModality, path: string, mimeType: string): Promise<MediaPart> {
  return { type, mimeType, data: new Uint8Array(await readFile(path)) };
}

/** Calls describe for a batch; on failure retries once, then gives every piece an empty description. */
async function describeParts(describer: Describer, parts: MediaPart[]): Promise<PieceDescription[]> {
  if (!parts.length) return [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await describer.provider.describe({ model: describer.model, pieces: parts });
      if (result.length === parts.length) return result;
    } catch (error) {
      if (attempt === 1) console.warn('describe failed; storing empty descriptions', String(error));
    }
  }
  return parts.map(() => ({ ...EMPTY_DESCRIPTION }));
}

const merge = (visual: PieceDescription, audio: PieceDescription): PieceDescription => ({
  summary: [visual.summary, audio.summary].filter(Boolean).join(' '),
  transcript: audio.transcript || visual.transcript,
  visible_text: visual.visible_text,
  tags: [...new Set([...visual.tags, ...audio.tags])],
});

/**
 * Describes up to `batch` pieces per provider call. Uses the piece itself when the model takes its modality,
 * otherwise the fallback (page image for PDFs; poster frame + audio track for video), otherwise nothing.
 */
export async function describePieces(
  describer: Describer,
  inputs: DescribeInput[],
  batch: number,
): Promise<PieceDescription[]> {
  const caps = describer.provider.capabilities(describer.model).input;
  const results: PieceDescription[] = inputs.map(() => ({ ...EMPTY_DESCRIPTION }));
  // Each plan entry: which result slot it fills and how (direct, or the visual/audio half of a video fallback).
  const plan: { index: number; role: 'direct' | 'visual' | 'audio'; part: MediaPart }[] = [];
  for (const [index, input] of inputs.entries()) {
    if (input.modality === 'text') continue;
    const modality: MediaModality = input.modality;
    if (caps[modality]) {
      plan.push({ index, role: 'direct', part: await part(modality, input.path, input.mimeType) });
      continue;
    }
    if (input.thumbnail && caps.image)
      plan.push({
        index,
        role: input.modality === 'video' ? 'visual' : 'direct',
        part: await part('image', input.thumbnail, 'image/jpeg'),
      });
    if (input.modality === 'video' && input.audioTrack && caps.audio)
      plan.push({ index, role: 'audio', part: await part('audio', input.audioTrack, 'audio/mpeg') });
  }
  // Adapters describe each part of a batch separately, so a batch bounds in-flight calls and memory.
  const size = Math.max(1, batch);
  const visual = new Map<number, PieceDescription>();
  const audio = new Map<number, PieceDescription>();
  for (let start = 0; start < plan.length; start += size) {
    const slice = plan.slice(start, start + size);
    const described = await describeParts(
      describer,
      slice.map((entry) => entry.part),
    );
    slice.forEach((entry, i) => {
      if (entry.role === 'direct') results[entry.index] = described[i];
      else (entry.role === 'visual' ? visual : audio).set(entry.index, described[i]);
    });
  }
  for (const index of new Set([...visual.keys(), ...audio.keys()]))
    results[index] = merge(visual.get(index) ?? EMPTY_DESCRIPTION, audio.get(index) ?? EMPTY_DESCRIPTION);
  return results;
}
