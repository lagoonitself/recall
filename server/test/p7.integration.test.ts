import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConversationDetailResponseSchema, SseEventSchema, type SseEvent } from '@app/shared';
import { createPool } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { signToken } from '../src/lib/auth.js';
import { createR2 } from '../src/lib/r2.js';
import { createApp } from '../src/index.js';
import { FakeProvider, type LlmProvider, type ProviderEvent } from '../src/agent/provider/index.js';
import { probeDuration } from '../src/ingest/splitters/media.js';
import type { SearchResult } from '../src/retrieval/search.js';

const testUrl = process.env.TEST_DATABASE_URL;
const ready = Boolean(
  testUrl && process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY,
);

function parseSse(text: string): SseEvent[] {
  return text
    .split('\n\n')
    .filter((frame) => frame.trim() && !frame.startsWith(':'))
    .map((frame) => {
      const event = /^event: (.+)$/m.exec(frame)![1];
      const data = JSON.parse(/^data: (.+)$/m.exec(frame)![1]);
      return SseEventSchema.parse({ event, data });
    });
}

describe.skipIf(!ready)('P7 chat API on test database and R2', () => {
  if (testUrl === process.env.DATABASE_URL)
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  const pool = createPool(testUrl!);
  const storage = createR2();
  const secret = 'test-secret-'.repeat(4);
  let provider: () => LlmProvider = () => new FakeProvider();
  let searchResults: SearchResult[] = [];
  const searches: unknown[] = [];
  const app = createApp({
    pool,
    jwtSecret: secret,
    storage,
    chat: {
      provider: () => provider(),
      model: 'fake',
      search: async (options) => {
        searches.push(options);
        return searchResults;
      },
      probeDuration,
      chatPerMin: 100,
    },
  });
  let server: Server;
  let base = '';
  const users: string[] = [];
  let auth = '';
  let otherAuth = '';
  let collectionId = '';
  let chunkId = '';
  let fileId = '';

  beforeAll(async () => {
    await migrate(pool);
    for (let i = 0; i < 2; i++)
      users.push(
        (
          await pool.query('INSERT INTO users(email) VALUES ($1) RETURNING id', [
            `p7-${randomUUID()}@example.com`,
          ])
        ).rows[0].id,
      );
    auth = `Bearer ${signToken(users[0], secret)}`;
    otherAuth = `Bearer ${signToken(users[1], secret)}`;
    collectionId = (
      await pool.query('INSERT INTO collections(user_id,name) VALUES ($1,$2) RETURNING id', [users[0], 'Car'])
    ).rows[0].id;
    fileId = randomUUID();
    const prefix = `users/${users[0]}/files/${fileId}/`;
    await storage.put(`${prefix}pieces/0.txt`, Buffer.from('Coolant light: engine too hot.'), 'text/plain');
    await pool.query(
      `INSERT INTO files(id,user_id,collection_id,name,mime_type,modality,size_bytes,r2_key,status)
       VALUES ($1,$2,$3,'manual.txt','text/plain','text',30,$4,'ready')`,
      [fileId, users[0], collectionId, `${prefix}original`],
    );
    const vector = `[${Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
    chunkId = (
      await pool.query(
        `INSERT INTO chunks(file_id,user_id,collection_id,modality,seq,char_start,char_end,r2_key,summary,embedding)
         VALUES ($1,$2,$3,'text',0,0,30,$4,'Coolant light meaning',$5::halfvec) RETURNING id`,
        [fileId, users[0], collectionId, `${prefix}pieces/0.txt`, vector],
      )
    ).rows[0].id;
    searchResults = [
      {
        chunkId,
        fileId,
        fileName: 'manual.txt',
        modality: 'text',
        location: { charStart: 0, charEnd: 30 },
        score: 0.03,
        summary: 'Coolant light meaning',
        thumbKey: null,
      },
    ];
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  }, 60_000);

  afterAll(async () => {
    try {
      server?.close();
      for (const id of users) await storage.deletePrefix(`users/${id}/`);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    } finally {
      await pool.end();
    }
  }, 60_000);

  const json = (path: string, init: RequestInit = {}, token = auth) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { authorization: token, 'content-type': 'application/json', ...init.headers },
    });
  const send = (conversationId: string, form: FormData, signal?: AbortSignal) =>
    fetch(`${base}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { authorization: auth },
      body: form,
      signal,
    });
  const newConversation = async () =>
    (
      (await (
        await json('/conversations', { method: 'POST', body: JSON.stringify({ collectionId }) })
      ).json()) as {
        conversation: { id: string };
      }
    ).conversation.id;

  it('streams search → open → cited answer and saves it', async () => {
    const turns: ProviderEvent[][] = [
      [
        { type: 'reasoning.delta', text: 'Search with the photo and the words.' },
        {
          type: 'tool_call',
          id: 'a',
          name: 'search_library',
          args: { query: 'warning light', attachment_id: 'A1' },
        },
        { type: 'turn.end', stopReason: 'tool_calls' },
      ],
      [
        { type: 'tool_call', id: 'b', name: 'open_sources', args: { source_ids: ['S1'] } },
        { type: 'turn.end', stopReason: 'tool_calls' },
      ],
      [
        { type: 'text.delta', text: 'The engine is too hot [S1][S7].' },
        { type: 'turn.end', stopReason: 'stop', providerState: { parts: [] } },
      ],
    ];
    provider = () => new FakeProvider({ turns });
    const created = await json('/conversations', { method: 'POST', body: JSON.stringify({ collectionId }) });
    expect(created.status).toBe(201);
    const { conversation } = (await created.json()) as { conversation: { id: string; collectionId: string } };
    expect(conversation.collectionId).toBe(collectionId);
    expect((await json(`/conversations/${conversation.id}`, {}, otherAuth)).status).toBe(404);

    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append('text', 'What does this light mean?');
    form.append('files', new Blob([png], { type: 'image/png' }), 'light.png');
    const response = await send(conversation.id, form);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    const events = parseSse(await response.text());
    const names = events.map((e) => e.event);
    expect(names.slice(-2)).toEqual(['sources', 'done']);
    const answer = events.flatMap((e) => (e.event === 'answer.delta' ? [e.data.text] : [])).join('');
    expect(answer).toBe('The engine is too hot [S1].');
    const sources = events.find((e) => e.event === 'sources');
    expect(sources?.data).toEqual([
      {
        sid: 'S1',
        chunkId,
        fileName: 'manual.txt',
        modality: 'text',
        location: { charStart: 0, charEnd: 30 },
        thumbUrl: null,
      },
    ]);
    // Search was scoped to the user and the conversation's collection, with the attachment bytes.
    expect(searches.at(-1)).toMatchObject({ userId: users[0], collectionId, query: 'warning light' });
    expect((searches.at(-1) as { attachment: { mimeType: string } }).attachment.mimeType).toBe('image/png');

    const detail = await json(`/conversations/${conversation.id}`);
    const body = ConversationDetailResponseSchema.parse(await detail.json());
    expect(body.conversation.title).toBe('What does this light mean?');
    expect(body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(body.messages[0].attachments).toMatchObject([{ modality: 'image', name: 'light.png' }]);
    expect(JSON.stringify(body)).not.toContain('users/');
    const assistant = body.messages[1];
    expect(assistant.content).toBe('The engine is too hot [S1].');
    expect(assistant.sources.map((s) => s.sid)).toEqual(['S1']);
    expect(assistant.steps.map((s) => s.kind)).toEqual([
      'reasoning',
      'tool_call',
      'tool_result',
      'tool_call',
      'sources_opened',
    ]);
    const done = events.find((e) => e.event === 'done');
    expect(done?.data).toEqual({ messageId: assistant.id });
    const list = (await (await json('/conversations')).json()) as { conversations: { id: string }[] };
    expect(list.conversations.map((c) => c.id)).toContain(conversation.id);
  });

  it('validates attachments before streaming', async () => {
    const id = await newConversation();
    const text = new FormData();
    text.append('files', new Blob(['hi'], { type: 'text/plain' }), 'a.txt');
    expect((await send(id, text)).status).toBe(415);
    const many = new FormData();
    for (let i = 0; i < 4; i++) many.append('files', new Blob(['x'], { type: 'image/png' }), `${i}.png`);
    expect((await send(id, many)).status).toBe(400);
    expect((await send(id, new FormData())).status).toBe(400);

    const dir = mkdtempSync(join(tmpdir(), 'p7-'));
    try {
      const path = join(dir, 'long.mp4');
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=16x16:r=1:d=81',
        '-pix_fmt',
        'yuv420p',
        path,
      ]);
      const video = new FormData();
      video.append('text', 'what happens here?');
      video.append('files', new Blob([readFileSync(path)], { type: 'video/mp4' }), 'long.mp4');
      const response = await send(id, video);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'VIDEO_TOO_LONG' } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('saves a partial answer when the client disconnects', async () => {
    let release: () => void = () => {};
    const slow: LlmProvider = {
      capabilities: () => new FakeProvider().capabilities('fake'),
      describe: async () => [],
      async *streamTurn() {
        yield { type: 'reasoning.delta', text: 'Thinking about it' };
        await new Promise<void>((resolve) => {
          release = resolve;
          setTimeout(resolve, 5000);
        });
        yield { type: 'text.delta', text: 'too late' };
        yield { type: 'turn.end', stopReason: 'stop' };
      },
    };
    provider = () => slow;
    const id = await newConversation();
    const controller = new AbortController();
    const form = new FormData();
    form.append('text', 'slow question');
    const response = await send(id, form, controller.signal);
    const reader = response.body!.getReader();
    let seen = '';
    while (!seen.includes('reasoning.delta')) seen += new TextDecoder().decode((await reader.read()).value);
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    let saved: { content: string; id: string } | undefined;
    for (let i = 0; i < 50 && !saved; i++) {
      saved = (
        await pool.query(
          `SELECT id, content FROM messages WHERE conversation_id = $1 AND role = 'assistant'`,
          [id],
        )
      ).rows[0];
      if (!saved) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(saved?.content).toBe('_(Stopped.)_');
    const steps = await pool.query('SELECT kind, payload FROM agent_steps WHERE message_id = $1', [
      saved!.id,
    ]);
    expect(steps.rows).toEqual([{ kind: 'reasoning', payload: { text: 'Thinking about it' } }]);
  });

  it('rate-limits chat messages per user', async () => {
    const limited = createApp({
      pool,
      jwtSecret: secret,
      storage,
      chat: { provider: () => new FakeProvider(), model: 'fake', search: async () => [], chatPerMin: 1 },
    });
    const s = await new Promise<Server>((resolve) => {
      const listening = limited.listen(0, () => resolve(listening));
    });
    try {
      const id = await newConversation();
      const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/conversations/${id}/messages`;
      const post = () =>
        fetch(url, { method: 'POST', headers: { authorization: auth }, body: new FormData() });
      expect((await post()).status).toBe(400);
      expect((await post()).status).toBe(429);
    } finally {
      s.close();
    }
  });
});
