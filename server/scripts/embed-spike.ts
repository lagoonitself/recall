import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required in server/.env');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const vectors = new Map<string, number[]>();

function pdf(pages: number): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, index) => `${index + 3} 0 R`).join(' ')}] >>`,
    ...Array.from({ length: pages }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> >>'),
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

async function probe(name: string, contents: string | { inlineData: { mimeType: string; data: string } }) {
  const start = performance.now();
  try {
    const result = await ai.models.embedContent({ model: 'gemini-embedding-2', contents, config: { outputDimensionality: 1536 } });
    const vector = result.embeddings?.[0]?.values;
    if (!vector) throw new Error('No embedding returned');
    vectors.set(name, vector);
    const norm = Math.hypot(...vector);
    console.log(`${name}: OK, dimensions=${vector.length}, norm=${norm.toFixed(6)}, latency=${Math.round(performance.now() - start)}ms`);
  } catch (error) {
    const err = error as { status?: number; message?: string };
    console.log(`${name}: FAILED status=${err.status ?? 'unknown'} ${err.message ?? ''}`);
    process.exitCode = 1;
  }
}

async function media(name: string, mimeType: string, bytes: Buffer) {
  await probe(name, { inlineData: { mimeType, data: bytes.toString('base64') } });
}

await probe('text-red', 'task: search result | query: A solid red square');
for (const [name, mimeType, filename] of [
  ['image-red-png', 'image/png', 'red.png'],
  ['image-blue-jpeg', 'image/jpeg', 'blue.jpg'],
  ['image-red-webp', 'image/webp', 'red.webp'],
  ['audio-181s-mp3', 'audio/mpeg', 'tone.mp3'],
  ['video-81s-with-audio', 'video/mp4', 'red.mp4'],
] as const) {
  await media(name, mimeType, await readFile(new URL(`./samples/${filename}`, import.meta.url)));
}
await media('pdf-6-pages', 'application/pdf', pdf(6));
await media('pdf-7-pages', 'application/pdf', pdf(7));
const query = vectors.get('text-red');
for (const name of ['image-red-png', 'image-blue-jpeg']) {
  const image = vectors.get(name);
  if (query && image) {
    const dot = query.reduce((sum, value, index) => sum + value * image[index]!, 0);
    console.log(`cosine(text-red, ${name})=${(dot / (Math.hypot(...query) * Math.hypot(...image))).toFixed(6)}`);
  }
}
