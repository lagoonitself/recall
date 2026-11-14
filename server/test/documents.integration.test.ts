import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { FakeDocumentAI, type DecisionAnswer } from '../src/agent/provider/documents.js';
import { DocumentQueue } from '../src/documents/queue.js';
import { signToken } from '../src/lib/auth.js';
import { createApp } from '../src/index.js';
import { TurnTools } from '../src/agent/tools.js';
import { capabilities } from '../src/agent/provider/index.js';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const yes = (p: number): DecisionAnswer => ({ type: 'noul', noul: p, confidence: Math.max(p, 1 - p) });

suite('document intelligence on TEST_DATABASE_URL', () => {
  if (url && url === process.env.DATABASE_URL)
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  const pool = createPool(url ?? 'postgres://localhost/unused');
  const secret = 'x'.repeat(40);
  const suffix = randomUUID();
  let user = '';
  let collection = '';
  let claim = '';
  let audio = '';
  let audioChunk = '';
  let photo = '';
  const objects = new Map<string, Uint8Array>();
  const storage = {
    getStream: async (key: string) => {
      const data = objects.get(key);
      if (!data) throw new Error(`missing ${key}`);
      return Readable.from([Buffer.from(data)]);
    },
  };
  const ai = new FakeDocumentAI({
    answer: (key, question, input) => {
      const evidence = input.some((p) => p.type === 'audio');
      if (key === 'doc_type' && question.type === 'choice')
        return {
          type: 'choice',
          choice: 'insurance_claim',
          probabilities: { insurance_claim: 0.93, invoice: 0.04, other: 0.03 },
          confidence: 0.93,
        };
      if (key === 'legibility')
        return { type: 'score', score: 2, probabilities: { 0: 0, 1: 0, 2: 1 }, confidence: 1 };
      if (key === 'is_document') return yes(0.05); // only asked for images: the photo is not a document
      if (key === 'chk_tampered') return yes(0.04);
      if (key === 'chk_complete') return yes(0.97);
      if (key === 'chk_insurance_claim__signed') return yes(0.9);
      if (key.startsWith('fld_')) return yes(key === 'fld_claimed_amount' ? 0.3 : 0.92);
      if (evidence && key.startsWith('rel_')) return yes(0.9);
      // Claim index 1 is the incident date: the call gives another date.
      if (evidence && key === 'con_1') return yes(0.88);
      if (evidence && key.startsWith('con_')) return yes(0.1);
      if (evidence && key === 'sup_0') return yes(0.95);
      if (evidence && key.startsWith('sup_')) return yes(0.2);
      return undefined;
    },
    extract: () => ({
      summary: 'Motor claim for rear bumper damage.',
      fields: {
        claim_number: { value: 'CLM-1', page: 1 },
        policy_number: { value: 'MTR-4471', page: 1 },
        claimant_name: { value: 'Priya Sharma', page: 1 },
        incident_date: { value: '2026-11-03', page: 1 },
        incident_location: { value: 'Marathahalli', page: 1 },
        asset: { value: 'White Hyundai Creta', page: 1 },
        damage_description: { value: 'Rear bumper damaged', page: 1 },
        claimed_amount: { value: '45000', page: 1 },
      },
    }),
  });
  let queue: DocumentQueue;
  let auth = '';

  beforeAll(async () => {
    await migrate(pool);
    user = (
      await pool.query('INSERT INTO users(email) VALUES ($1) RETURNING id', [`docs-${suffix}@example.com`])
    ).rows[0].id;
    collection = (
      await pool.query('INSERT INTO collections(user_id,name) VALUES ($1,$2) RETURNING id', [user, 'claims'])
    ).rows[0].id;
    const file = async (name: string, mime: string, modality: string, key: string) =>
      (
        await pool.query(
          `INSERT INTO files(user_id,collection_id,name,mime_type,modality,size_bytes,r2_key,status)
           VALUES ($1,$2,$3,$4,$5,1,$6,'ready') RETURNING id`,
          [user, collection, name, mime, modality, key],
        )
      ).rows[0].id as string;
    objects.set(
      `${suffix}/claim.pdf`,
      await readFile(new URL('../../demo/claim-review/claim-form.pdf', import.meta.url)),
    );
    objects.set(`${suffix}/call.mp3`, new Uint8Array([1, 2, 3]));
    objects.set(`${suffix}/photo.jpg`, new Uint8Array([4, 5, 6]));
    claim = await file('claim-form.pdf', 'application/pdf', 'pdf', `${suffix}/claim.pdf`);
    audio = await file('claimant-call.mp3', 'audio/mpeg', 'audio', `${suffix}/call-original.mp3`);
    photo = await file('car.jpg', 'image/jpeg', 'image', `${suffix}/photo.jpg`);
    const zero = `[${Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
    audioChunk = (
      await pool.query(
        `INSERT INTO chunks(file_id,user_id,collection_id,modality,seq,start_sec,end_sec,r2_key,transcript,embedding)
         VALUES ($1,$2,$3,'audio',0,0,30,$4,'The accident happened on the tenth of November.',$5::halfvec) RETURNING id`,
        [audio, user, collection, `${suffix}/call.mp3`, zero],
      )
    ).rows[0].id;
    queue = new DocumentQueue({
      pool,
      storage,
      ai,
      // The real hybrid search is covered elsewhere; here every query finds the call (and the claim itself).
      search: async () => [
        {
          chunkId: audioChunk,
          fileId: audio,
          fileName: 'claimant-call.mp3',
          modality: 'audio',
          location: { startSec: 0, endSec: 30 },
          score: 1,
          summary: null,
          thumbKey: null,
        },
        {
          chunkId: audioChunk,
          fileId: claim,
          fileName: 'claim-form.pdf',
          modality: 'pdf',
          location: { page: 1 },
          score: 0.5,
          summary: null,
          thumbKey: null,
        },
      ],
      today: () => new Date('2026-11-14T00:00:00Z'),
    });
    auth = `Bearer ${signToken(user, secret)}`;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE id = $1', [user]);
    await pool.end();
  });

  const app = () => createApp({ pool, jwtSecret: secret, documents: () => queue });

  it('lists ready document files that were never analysed', async () => {
    const res = await request(app())
      .get(`/api/documents?collectionId=${collection}`)
      .set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ documents: [], unanalyzed: 2 });
  });

  it('classifies, extracts, verifies and cross-checks a claim against the call recording', async () => {
    const res = await request(app())
      .post('/api/documents/analyze-collection')
      .set('Authorization', auth)
      .send({ collectionId: collection });
    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(2);
    await queue.idle();
    const list = await request(app())
      .get(`/api/documents?collectionId=${collection}`)
      .set('Authorization', auth);
    const docs = list.body.documents as { fileId: string; status: string; [k: string]: unknown }[];
    expect(list.body.unanalyzed).toBe(0);
    expect(docs.find((d) => d.fileId === photo)?.status).toBe('not_document');
    const doc = docs.find((d) => d.fileId === claim) as never as import('@app/shared').DocInsight;
    expect(doc).toMatchObject({
      status: 'ready',
      docType: 'insurance_claim',
      docTypeLabel: 'Insurance claim',
      reviewStatus: 'needs_review',
    });
    expect(doc.fields.find((f) => f.key === 'claimed_amount')).toMatchObject({
      value: '45000',
      confidence: 0.3,
    });
    expect(doc.checks.find((c) => c.id === 'ai:fields')?.status).toBe('fail');
    expect(doc.checks.find((c) => c.id === 'ai:tampered')?.status).toBe('pass');
    const conflict = doc.checks.find((c) => c.id === 'cross:incident_date');
    expect(conflict).toMatchObject({ group: 'cross', status: 'fail', probability: 0.88 });
    expect(conflict?.evidence).toMatchObject({
      chunkId: audioChunk,
      fileName: 'claimant-call.mp3',
      location: { startSec: 0, endSec: 30 },
    });
    expect(doc.checks.find((c) => c.id === 'cross:claimant_name')?.status).toBe('pass');
    // The decision model saw the actual PDF, and the call as audio.
    expect(ai.calls[0].input.some((p) => p.type === 'document')).toBe(true);
    expect(ai.calls.some((c) => c.input.some((p) => p.type === 'audio'))).toBe(true);
  });

  it('records a human review decision and keeps it on a cross-only recheck without new conflicts', async () => {
    const res = await request(app())
      .patch(`/api/documents/${claim}/review`)
      .set('Authorization', auth)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.document.reviewStatus).toBe('approved');
    queue.enqueue(claim, true);
    await queue.idle();
    const after = await request(app()).get(`/api/documents/${claim}`).set('Authorization', auth);
    expect(after.body.document.reviewStatus).toBe('approved');
  });

  it('gives the chat agent extracted fields and problems with citable source ids', async () => {
    const tools = new TurnTools(
      { pool, storage, search: async () => [] },
      { userId: user, collectionId: collection, attachments: [], capabilities: capabilities('fake') },
    );
    const outcome = await tools.run('list_documents', { needs_review: false });
    expect(outcome.modelText).toContain('claim-form.pdf');
    expect(outcome.modelText).toContain('Incident date: 2026-11-03');
    expect(outcome.modelText).toContain('FAIL Incident date vs other media');
  });

  it("does not show another user's documents", async () => {
    const stranger = `Bearer ${signToken(randomUUID(), secret)}`;
    const res = await request(app()).get(`/api/documents/${claim}`).set('Authorization', stranger);
    expect(res.status).toBe(404);
  });
});
