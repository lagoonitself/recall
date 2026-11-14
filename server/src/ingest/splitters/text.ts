import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import mammoth from 'mammoth';

export interface TextPiece {
  text: string;
  charStart: number;
  charEnd: number;
}

export function splitText(text: string, size = 3200, overlap = 400): TextPiece[] {
  if (!Number.isInteger(size) || !Number.isInteger(overlap) || size <= 0 || overlap < 0 || overlap >= size) {
    throw new Error('Invalid text chunk size or overlap');
  }
  const pieces: TextPiece[] = [];
  for (let start = 0; start < text.length; start += size - overlap) {
    const end = Math.min(start + size, text.length);
    pieces.push({ text: text.slice(start, end), charStart: start, charEnd: end });
    if (end === text.length) break;
  }
  return pieces;
}

export async function splitTextFile(path: string, mimeType: string, directory: string) {
  const text =
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ? (await mammoth.extractRawText({ path })).value
      : await readFile(path, 'utf8');
  return Promise.all(
    splitText(text).map(async (piece, index) => {
      const piecePath = join(directory, `piece-${index}.txt`);
      await writeFile(piecePath, piece.text, 'utf8');
      return { ...piece, path: piecePath, mimeType: 'text/plain' as const };
    }),
  );
}
