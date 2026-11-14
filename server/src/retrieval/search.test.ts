import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPool } from '../db/index.js';
import { migrate } from '../db/migrate.js';
import { splitAudio } from './audio.js';
import { createSearchLibrary, fuseRanks } from './search.js';

const row = (id: string) => ({
  id,
  file_id: id,
  file_name: id,
  modality: 'text' as const,
  page: null,
  start_sec: null,
  end_sec: null,
  char_start: 0,
  char_end: 4,
  summary: null,
  thumb_r2_key: null,
});

describe('reciprocal rank fusion', () => {
  it('fuses rankings, deduplicates each leg and maps location', () => {
    const results = fuseRanks(
      [
        [row('a'), row('b'), row('b')],
        [row('b'), row('c')],
      ],
      2,
    );
    expect(results.map((result) => result.chunkId)).toEqual(['b', 'a']);
    expect(results[0].score).toBeCloseTo(1 / 62 + 1 / 61);
    expect(results[0].location).toEqual({ charStart: 0, charEnd: 4 });
  });
});

describe('audio splitting', () => {
  it('splits an actual audio recording into searchable pieces', async () => {
    const data = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2.5',
      '-f',
      'wav',
      'pipe:1',
    ]);
    const pieces = await splitAudio(data, 1);
    expect(pieces).toHaveLength(3);
    expect(pieces.every((piece) => piece.byteLength > 0)).toBe(true);
  }, 30000);
  it('embeds and searches every audio piece', async () => {
    const pieces = [new Uint8Array([1]), new Uint8Array([2])];
    const split = vi.fn().mockResolvedValue(pieces);
    const vector = Array.from({ length: 1536 }, (_, index) => (index === 0 ? 1 : 0));
    const media = vi.fn().mockResolvedValue(vector);
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes('pg_extension')) return { rows: [{ extversion: '0.8.0' }] };
      if (sql.includes('WITH candidates')) return { rows: [row('a')] };
      return { rows: [] };
    });
    const pool = { connect: async () => ({ query: execute, release: vi.fn() }) } as unknown as pg.Pool;
    const search = createSearchLibrary({
      pool,
      embedText: vi.fn(),
      embedMedia: media,
      splitAudio: split,
      audioPieceSec: 150,
    });
    const result = await search({
      userId: 'user',
      attachment: { mimeType: 'audio/wav', data: new Uint8Array([3]) },
    });
    expect(split).toHaveBeenCalledWith(new Uint8Array([3]), 150);
    expect(media).toHaveBeenCalledTimes(2);
    expect(media).toHaveBeenCalledWith({ mimeType: 'audio/mpeg', data: pieces[0] });
    expect(result[0].score).toBeCloseTo(2 / 61);
  });
});

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('retrieval on TEST_DATABASE_URL', () => {
  if (url && url === process.env.DATABASE_URL)
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  const pool = createPool(url ?? 'postgres://localhost/unused');
  const suffix = randomUUID();
  const emails = [`p6-${suffix}@example.com`, `p6-other-${suffix}@example.com`];
  const ids: string[] = [];
  let collection = '';
  let otherCollection = '';
  let imageFile = '';
  let imageChunk = '';
  let keywordChunk = '';
  const vector = (index: number) =>
    Array.from({ length: 1536 }, (_, position) => (position === index ? 1 : 0));
  const embedText = vi.fn(async () => vector(0));
  const embedMedia = vi.fn(async () => vector(1));
  const search = createSearchLibrary({ pool, embedText, embedMedia, splitAudio, audioPieceSec: 150 });
  beforeAll(async () => {
    await migrate(pool);
    for (const email of emails)
      ids.push((await pool.query('INSERT INTO users(email) VALUES ($1) RETURNING id', [email])).rows[0].id);
    collection = (
      await pool.query('INSERT INTO collections(user_id,name) VALUES ($1,$2) RETURNING id', [ids[0], 'one'])
    ).rows[0].id;
    otherCollection = (
      await pool.query('INSERT INTO collections(user_id,name) VALUES ($1,$2) RETURNING id', [ids[0], 'two'])
    ).rows[0].id;
    const foreignCollection = (
      await pool.query('INSERT INTO collections(user_id,name) VALUES ($1,$2) RETURNING id', [ids[1], 'other'])
    ).rows[0].id;
    async function file(user: string, folder: string, modality: string) {
      return (
        await pool.query(
          `INSERT INTO files(user_id,collection_id,name,mime_type,modality,size_bytes,r2_key)
        VALUES ($1,$2,$3,$4,$5,1,$6) RETURNING id`,
          [user, folder, modality, 'application/octet-stream', modality, suffix],
        )
      ).rows[0].id as string;
    }
    const textFile = await file(ids[0], collection, 'text');
    imageFile = await file(ids[0], otherCollection, 'image');
    const foreignFile = await file(ids[1], foreignCollection, 'image');
    async function chunk(
      fileId: string,
      user: string,
      folder: string,
      modality: string,
      seq: number,
      embedding: number[],
      summary: string,
    ) {
      return (
        await pool.query(
          `INSERT INTO chunks(file_id,user_id,collection_id,modality,seq,r2_key,summary,embedding)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::halfvec) RETURNING id`,
          [fileId, user, folder, modality, seq, suffix, summary, `[${embedding.join(',')}]`],
        )
      ).rows[0].id as string;
    }
    for (let index = 0; index < 31; index++)
      await chunk(textFile, ids[0], collection, 'text', index, vector(0), 'ordinary');
    keywordChunk = await chunk(textFile, ids[0], collection, 'text', 31, vector(2), 'P0217');
    imageChunk = await chunk(imageFile, ids[0], otherCollection, 'image', 0, vector(1), 'image');
    await chunk(foreignFile, ids[1], foreignCollection, 'image', 0, vector(1), 'P0217');
  }, 60000);
  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
    await pool.end();
  }, 30000);
  it('finds exact keyword outside the vector top 30 and isolates users', async () => {
    const results = await search({ userId: ids[0], query: 'P0217', limit: 100 });
    expect(embedText).toHaveBeenCalledWith('P0217', 'query');
    expect(results.some((result) => result.chunkId === keywordChunk)).toBe(true);
    expect(results.every((result) => result.fileId !== undefined)).toBe(true);
    expect(results).toHaveLength(31);
  });
  it('finds the matching image, applies filters and handles stop words', async () => {
    const attachment = { mimeType: 'image/png', data: new Uint8Array([1]) };
    const results = await search({ userId: ids[0], attachment });
    expect(results[0].chunkId).toBe(imageChunk);
    expect(
      (await search({ userId: ids[0], attachment, types: ['text'] })).every(
        (item) => item.modality === 'text',
      ),
    ).toBe(true);
    expect(await search({ userId: ids[0], attachment, collectionId: collection, fileId: imageFile })).toEqual(
      [],
    );
    expect(
      (await search({ userId: ids[0], attachment, collectionId: otherCollection, fileId: imageFile })).map(
        (item) => item.chunkId,
      ),
    ).toEqual([imageChunk]);
    expect(await search({ userId: ids[1], attachment, fileId: imageFile })).toEqual([]);
    expect(await search({ userId: ids[0], query: 'the', fileId: imageFile })).toHaveLength(1);
  }, 30000);
  it('uses the HNSW index for the filtered vector leg', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL enable_seqscan = off');
      await client.query('SET LOCAL enable_sort = off');
      await client.query('SET LOCAL hnsw.ef_search = 100');
      await client.query('SET LOCAL hnsw.iterative_scan = relaxed_order');
      const plan = await client.query(
        `EXPLAIN (ANALYZE, FORMAT JSON) SELECT c.id FROM chunks c
        JOIN files f ON f.id = c.file_id WHERE c.user_id = $2 AND f.user_id = $2
        AND ($3::uuid IS NULL OR c.collection_id = $3) AND ($4::text[] IS NULL OR c.modality = ANY($4))
        AND ($5::uuid IS NULL OR c.file_id = $5) ORDER BY c.embedding <=> $1::halfvec LIMIT 30`,
        [`[${vector(1).join(',')}]`, ids[0], null, null, null],
      );
      expect(JSON.stringify(plan.rows)).toContain('chunks_embedding_idx');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }, 30000);
});
