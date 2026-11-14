import { describe, expect, it } from 'vitest';
import { splitText } from './text.js';

describe('splitText', () => {
  it('preserves the original text and overlapping offsets', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz';
    const chunks = splitText(text, 10, 3);
    expect(chunks.map(({ charStart, charEnd }) => [charStart, charEnd])).toEqual([
      [0, 10],
      [7, 17],
      [14, 24],
      [21, 26],
    ]);
    for (const chunk of chunks) expect(chunk.text).toBe(text.slice(chunk.charStart, chunk.charEnd));
  });
  it('handles empty and exact-sized input', () => {
    expect(splitText('')).toEqual([]);
    expect(splitText('hello', 5, 1)).toHaveLength(1);
  });
  it('rejects invalid sizing', () => {
    expect(() => splitText('abc', 1, 1)).toThrow();
    expect(() => splitText('abc', 0, 0)).toThrow();
  });
});
