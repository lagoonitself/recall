/**
 * Live check of document intelligence against real Gemini (Decision 1 + extraction) on the files in
 * demo/claim-review, using TEST_DATABASE_URL and in-memory storage. Usage: npx tsx scripts/doc-live-check.ts
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createPool } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { GeminiDocumentAI } from '../src/agent/provider/documents.js';
import { analyzeDocument } from '../src/documents/analyze.js';
import type { SearchResult } from '../src/retrieval/search.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || url === process.env.DATABASE_URL)
  throw new Error('Set TEST_DATABASE_URL (not the production DB)');
const pool = createPool(url);
await migrate(pool);
const demo = (name: string) => readFile(new URL(`../../demo/claim-review/${name}`, import.meta.url));
const ai = new GeminiDocumentAI(
  process.env.GEMINI_API_KEY!,
  process.env.DECISION_MODEL || 'gemini-decision-1',
  process.env.EXTRACT_MODEL || 'gemini-3.5-flash-lite',
);
const objects = new Map<string, Uint8Array>();
const s = randomUUID();
const user = (
  await pool.query('INSERT INTO users(email) VALUES ($1) RETURNING id', [`live-${s}@example.com`])
).rows[0].id;
const collection = (
  await pool.query('INSERT INTO collections(user_id,name) VALUES ($1,$2) RETURNING id', [user, 'live'])
).rows[0].id;
const vec = `[${Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
async function file(name: string, mime: string, modality: string, data?: Uint8Array) {
  const key = `${s}/${name}`;
  if (data) objects.set(key, data);
  return (
    await pool.query(
      `INSERT INTO files(user_id,collection_id,name,mime_type,modality,size_bytes,r2_key,status)
       VALUES ($1,$2,$3,$4,$5,1,$6,'ready') RETURNING id`,
      [user, collection, name, mime, modality, key],
    )
  ).rows[0].id as string;
}
async function chunk(fileId: string, modality: string, key: string, extra: Record<string, unknown>) {
  const cols = Object.keys(extra);
  return (
    await pool.query(
      `INSERT INTO chunks(file_id,user_id,collection_id,modality,seq,r2_key,embedding${cols.map((c) => ',' + c).join('')})
       VALUES ($1,$2,$3,$4,0,$5,$6::halfvec${cols.map((_, i) => `,$${i + 7}`).join('')}) RETURNING id`,
      [fileId, user, collection, modality, key, vec, ...Object.values(extra)],
    )
  ).rows[0].id as string;
}

const claim = await file('claim-form.pdf', 'application/pdf', 'pdf', await demo('claim-form.pdf'));
const invoice = await file('garage-invoice.pdf', 'application/pdf', 'pdf', await demo('garage-invoice.pdf'));
const call = await file('claimant-call.mp3', 'audio/mpeg', 'audio');
objects.set(`${s}/call-0.mp3`, await demo('claimant-call.mp3'));
const callChunk = await chunk(call, 'audio', `${s}/call-0.mp3`, { start_sec: 0, end_sec: 30 });
const estimate = await file('repair-estimate.txt', 'text/plain', 'text');
const estimateText = (await demo('repair-estimate.txt')).toString('utf8');
const estimateChunk = await chunk(estimate, 'text', `${s}/est.txt`, {
  visible_text: estimateText,
  char_start: 0,
  char_end: estimateText.length,
});
const evidence: SearchResult[] = [
  {
    chunkId: callChunk,
    fileId: call,
    fileName: 'claimant-call.mp3',
    modality: 'audio',
    location: { startSec: 0, endSec: 30 },
    score: 1,
    summary: null,
    thumbKey: null,
  },
  {
    chunkId: estimateChunk,
    fileId: estimate,
    fileName: 'repair-estimate.txt',
    modality: 'text',
    location: {},
    score: 0.9,
    summary: null,
    thumbKey: null,
  },
];
const deps = {
  pool,
  ai,
  storage: {
    getStream: async (k: string) => Readable.from([Buffer.from(objects.get(k) ?? new Uint8Array())]),
  },
  search: async () => evidence,
};
try {
  const runs = [
    ['claim-form.pdf', claim],
    ['garage-invoice.pdf', invoice],
    ['repair-estimate.txt', estimate],
  ] as const;
  for (const [name, id] of runs) {
    const t = Date.now();
    const outcome = await analyzeDocument(deps, id);
    const row = (await pool.query('SELECT * FROM doc_insights WHERE file_id = $1', [id])).rows[0];
    console.log(`\n=== ${name}: ${outcome} in ${Date.now() - t} ms ===`);
    console.log(
      `type ${row.doc_type} (${row.type_confidence}) quality ${row.quality} review ${row.review_status} risk ${row.risk_score}`,
    );
    if (row.error) console.log('error:', row.error);
    console.log('summary:', row.summary);
    for (const f of row.fields) console.log(`  field ${f.label}: ${f.value} [p=${f.confidence}]`);
    for (const c of row.checks)
      console.log(
        `  ${c.status.toUpperCase().padEnd(4)} ${c.group}/${c.label}: ${c.detail}${c.probability !== null ? ` (p=${c.probability})` : ''}`,
      );
    console.log('  reasons:', row.review_reasons);
  }
} finally {
  await pool.query('DELETE FROM users WHERE id = $1', [user]);
  await pool.end();
}
