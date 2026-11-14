import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type pg from 'pg';
import {
  CreateConversationRequestSchema,
  type AgentStep,
  type Attachment,
  type Conversation,
  type Location,
  type Message,
  type Modality,
  type Source,
} from '@app/shared';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { rateLimit } from '../lib/rateLimit.js';
import { validate } from '../lib/validation.js';
import type { R2 } from '../lib/r2.js';
import { mimeInfo } from '../services/files.js';
import type { SearchOptions, SearchResult } from '../retrieval/search.js';
import type { AgentMessage, LlmProvider, MediaPart, TextPart } from '../agent/provider/index.js';
import { SseWriter } from '../agent/sse.js';
import { systemPrompt } from '../agent/prompt.js';
import { runAgent, type LoopResult } from '../agent/loop.js';
import { TurnTools, type TurnAttachment } from '../agent/tools.js';

export type ChatDeps = {
  provider: () => LlmProvider;
  model: string;
  search: (options: SearchOptions) => Promise<SearchResult[]>;
  probeDuration: (path: string) => Promise<number>;
  chatPerMin: number;
  heartbeatMs?: number;
};
type Storage = Pick<R2, 'put' | 'getStream' | 'signGet'>;

const MAX_ATTACHMENTS = 3;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_SEC = 80;
const MAX_TEXT = 4000;
const HISTORY_MESSAGES = 12;
const ATTACHMENT_MODALITIES = new Set<Modality>(['image', 'audio', 'video', 'pdf']);

type ConversationRow = {
  id: string;
  user_id: string;
  collection_id: string | null;
  title: string | null;
  created_at: Date;
};
type StoredAttachment = {
  id: string;
  modality: Modality;
  r2_key: string;
  mime_type: string;
  name: string;
  duration_sec?: number;
};
type StoredSource = {
  sid: string;
  chunk_id: string;
  file_id: string;
  file_name: string;
  modality: Modality;
  location: Location;
};
type MessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: StoredAttachment[];
  sources: StoredSource[];
  provider_state: unknown;
  created_at: Date;
};

const conversation = (row: ConversationRow): Conversation => ({
  id: row.id,
  userId: row.user_id,
  collectionId: row.collection_id,
  title: row.title,
  createdAt: row.created_at.toISOString(),
});
const attachment = (a: StoredAttachment): Attachment => ({
  id: a.id,
  modality: a.modality,
  mimeType: a.mime_type,
  name: a.name,
  ...(a.duration_sec === undefined ? {} : { durationSec: a.duration_sec }),
});
const params = z.object({ id: z.uuid() });
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Conversation not found');

/** Multer with the chat limits; its errors become the API error shape. */
function uploads(): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: MAX_ATTACHMENTS, fileSize: MAX_TOTAL_BYTES, fields: 4, fieldSize: 64 * 1024 },
  }).array('files', MAX_ATTACHMENTS);
  return (req, res, next) =>
    upload(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE')
          return next(new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Attachments may total at most 20 MB'));
        if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE')
          return next(new HttpError(400, 'TOO_MANY_FILES', 'At most 3 attachments per message'));
        return next(new HttpError(400, 'BAD_REQUEST', 'Invalid upload'));
      }
      next(error);
    });
}

export function conversationsRouter(
  pool: () => pg.Pool,
  secret: string,
  storage: () => Storage,
  deps: ChatDeps,
) {
  const router = Router();
  router.use(requireAuth(secret));

  const owned = async (id: string, userId: string) => {
    const result = await pool().query<ConversationRow & { collection_name: string | null }>(
      `SELECT c.*, col.name AS collection_name FROM conversations c
       LEFT JOIN collections col ON col.id = c.collection_id AND col.user_id = c.user_id
       WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    if (!result.rowCount) throw notFound();
    return result.rows[0];
  };

  router.get('/', async (req, res) => {
    const result = await pool().query<ConversationRow>(
      'SELECT * FROM conversations WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT 200',
      [req.user!.id],
    );
    res.json({ conversations: result.rows.map(conversation) });
  });

  router.post('/', validate({ body: CreateConversationRequestSchema }), async (req, res) => {
    const { collectionId } = CreateConversationRequestSchema.parse(req.body);
    if (collectionId) {
      const found = await pool().query('SELECT 1 FROM collections WHERE id = $1 AND user_id = $2', [
        collectionId,
        req.user!.id,
      ]);
      if (!found.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Collection not found');
    }
    const result = await pool().query<ConversationRow>(
      'INSERT INTO conversations(user_id, collection_id) VALUES ($1, $2) RETURNING *',
      [req.user!.id, collectionId ?? null],
    );
    res.status(201).json({ conversation: conversation(result.rows[0]) });
  });

  router.get('/:id', validate({ params }), async (req, res) => {
    const userId = req.user!.id;
    const row = await owned(req.params.id as string, userId);
    const messages = await pool().query<MessageRow>(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at, id',
      [row.id],
    );
    const steps = await pool().query<{
      id: string;
      message_id: string;
      seq: number;
      kind: AgentStep['kind'];
      payload: unknown;
      started_at: Date;
      ended_at: Date | null;
    }>('SELECT * FROM agent_steps WHERE message_id = ANY($1::uuid[]) ORDER BY message_id, seq', [
      messages.rows.map((m) => m.id),
    ]);
    const stepsByMessage = new Map<string, AgentStep[]>();
    for (const s of steps.rows) {
      const list = stepsByMessage.get(s.message_id) ?? [];
      list.push({
        id: Number(s.id),
        seq: s.seq,
        kind: s.kind,
        payload: s.payload,
        startedAt: s.started_at.toISOString(),
        endedAt: s.ended_at?.toISOString() ?? null,
      });
      stepsByMessage.set(s.message_id, list);
    }
    const chunkIds = [...new Set(messages.rows.flatMap((m) => m.sources.map((s) => s.chunk_id)))];
    const thumbs = await thumbKeys(pool(), userId, chunkIds);
    const out: Message[] = [];
    for (const m of messages.rows)
      out.push({
        id: m.id,
        conversationId: m.conversation_id,
        role: m.role,
        content: m.content,
        attachments: m.attachments.map(attachment),
        sources: await Promise.all(m.sources.map((s) => wireSource(s, thumbs, storage()))),
        steps: stepsByMessage.get(m.id) ?? [],
        createdAt: m.created_at.toISOString(),
      });
    res.json({ conversation: conversation(row), messages: out });
  });

  router.post(
    '/:id/messages',
    validate({ params }),
    rateLimit({ limit: deps.chatPerMin, windowMs: 60_000 }),
    uploads(),
    async (req, res) => {
      const userId = req.user!.id;
      const convo = await owned(req.params.id as string, userId);
      const text = z
        .string()
        .max(MAX_TEXT, `Messages may be at most ${MAX_TEXT} characters`)
        .parse(typeof req.body?.text === 'string' ? req.body.text : '')
        .trim();
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!text && !files.length)
        throw new HttpError(400, 'EMPTY_MESSAGE', 'Write a message or attach a file');
      if (files.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_BYTES)
        throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Attachments may total at most 20 MB');

      const messageId = randomUUID();
      const turn: TurnAttachment[] = [];
      for (const [index, file] of files.entries()) {
        const mimeType = file.mimetype.split(';')[0].trim().toLowerCase();
        const info = mimeInfo(mimeType);
        if (!info || !ATTACHMENT_MODALITIES.has(info.modality))
          throw new HttpError(415, 'UNSUPPORTED_TYPE', `${file.originalname}: unsupported file type`);
        let durationSec: number | undefined;
        if (info.modality === 'video' || info.modality === 'audio') {
          durationSec = await probe(file.buffer, info.ext, deps.probeDuration).catch(() => undefined);
          if (info.modality === 'video' && durationSec === undefined)
            throw new HttpError(400, 'UNREADABLE_MEDIA', `${file.originalname}: could not read the video`);
          if (info.modality === 'video' && durationSec! > MAX_VIDEO_SEC)
            throw new HttpError(
              400,
              'VIDEO_TOO_LONG',
              `${file.originalname}: videos may be at most 80 seconds`,
            );
        }
        turn.push({
          ref: `A${index + 1}`,
          id: randomUUID(),
          modality: info.modality,
          mimeType,
          name: file.originalname.slice(0, 255) || `attachment-${index + 1}.${info.ext}`,
          data: new Uint8Array(file.buffer),
          durationSec,
        });
      }
      const stored: StoredAttachment[] = [];
      for (const a of turn) {
        const ext = mimeInfo(a.mimeType)!.ext;
        const key = `users/${userId}/attachments/${messageId}/${a.id}.${ext}`;
        await storage().put(key, Buffer.from(a.data), a.mimeType);
        stored.push({
          id: a.id,
          modality: a.modality,
          r2_key: key,
          mime_type: a.mimeType,
          name: a.name,
          ...(a.durationSec === undefined ? {} : { duration_sec: a.durationSec }),
        });
      }

      const history = await pool().query<MessageRow>(
        `SELECT * FROM (SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2) h
         ORDER BY created_at, id`,
        [convo.id, HISTORY_MESSAGES],
      );
      await pool().query(
        `INSERT INTO messages(id, conversation_id, role, content, attachments) VALUES ($1, $2, 'user', $3, $4)`,
        [messageId, convo.id, text, JSON.stringify(stored)],
      );
      if (!convo.title)
        await pool().query('UPDATE conversations SET title = $2 WHERE id = $1 AND title IS NULL', [
          convo.id,
          title(text, turn),
        ]);

      const provider = deps.provider();
      const caps = provider.capabilities(deps.model);
      const messages: AgentMessage[] = history.rows.map(toAgentMessage);
      messages.push({ role: 'user', content: currentTurn(text, turn, caps) });
      const tools = new TurnTools(
        { pool: pool(), storage: storage(), search: deps.search },
        { userId, collectionId: convo.collection_id, attachments: turn, capabilities: caps },
      );

      const sse = new SseWriter(res, deps.heartbeatMs);
      const result = await runAgent({
        provider,
        model: deps.model,
        system: systemPrompt({
          scope: convo.collection_name
            ? { kind: 'collection', name: convo.collection_name }
            : { kind: 'all' },
          attachments: turn.map((a) => ({
            ref: a.ref,
            modality: a.modality,
            name: a.name,
            durationSec: a.durationSec,
          })),
        }),
        messages,
        tools,
        emit: (event) => sse.send(event),
        signal: sse.abort.signal,
      });

      const assistantId = randomUUID();
      try {
        await persist(pool(), convo.id, assistantId, result);
      } catch (error) {
        console.error('failed to save assistant message', error);
        sse.send({ event: 'error', data: { message: 'Could not save the answer. Please try again.' } });
        return sse.end();
      }
      if (result.status === 'error') {
        sse.send({ event: 'error', data: { message: result.error ?? 'Something went wrong' } });
        return sse.end();
      }
      if (result.status === 'aborted') return sse.end();
      const sources: Source[] = await Promise.all(
        result.cited.map(async (s) => ({
          sid: s.sid,
          chunkId: s.chunkId,
          fileName: s.fileName,
          modality: s.modality,
          location: s.location,
          thumbUrl: s.thumbKey
            ? await storage()
                .signGet(s.thumbKey)
                .catch(() => null)
            : null,
        })),
      );
      sse.send({ event: 'sources', data: sources });
      sse.send({ event: 'done', data: { messageId: assistantId } });
      sse.end();
    },
  );
  return router;
}

async function probe(data: Buffer, ext: string, probeDuration: ChatDeps['probeDuration']) {
  const dir = await mkdtemp(join(tmpdir(), 'recall-chat-'));
  try {
    const path = join(dir, `attachment.${ext}`);
    await writeFile(path, data);
    return await probeDuration(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function title(text: string, attachments: TurnAttachment[]) {
  const base = text || attachments.map((a) => a.name).join(', ') || 'New chat';
  const line = base.split('\n')[0].trim();
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

function toAgentMessage(row: MessageRow): AgentMessage {
  if (row.role === 'assistant')
    return {
      role: 'assistant',
      content: row.content || '(no answer)',
      ...(row.provider_state ? { providerState: row.provider_state } : {}),
    };
  const note = row.attachments.length
    ? `\n[Earlier attachments, no longer searchable: ${row.attachments.map((a) => `${a.modality} "${a.name}"`).join(', ')}]`
    : '';
  return { role: 'user', content: [{ type: 'text', text: (row.content || '(no text)') + note }] };
}

/** The new user message: text plus the attachments the model can take natively. */
function currentTurn(
  text: string,
  attachments: TurnAttachment[],
  caps: ReturnType<LlmProvider['capabilities']>,
): (TextPart | MediaPart)[] {
  const parts: (TextPart | MediaPart)[] = [
    { type: 'text', text: text || '(The user sent only attachments.)' },
  ];
  let budget = Math.max(1, caps.maxMediaPartsPerRequest);
  for (const a of attachments) {
    const type = a.modality as MediaPart['type'];
    if (caps.input[type] && budget > 0) {
      budget--;
      parts.push({ type: 'text', text: `Attachment ${a.ref} (${a.modality}, "${a.name}"):` });
      parts.push({ type, mimeType: a.mimeType, data: a.data });
    } else {
      parts.push({
        type: 'text',
        text: `Attachment ${a.ref} (${a.modality}, "${a.name}") cannot be shown to you directly; search with attachment_id "${a.ref}".`,
      });
    }
  }
  return parts;
}

async function persist(pool: pg.Pool, conversationId: string, id: string, result: LoopResult) {
  const sources: StoredSource[] = result.cited.map((s) => ({
    sid: s.sid,
    chunk_id: s.chunkId,
    file_id: s.fileId,
    file_name: s.fileName,
    modality: s.modality,
    location: s.location,
  }));
  const content = result.answer || (result.status === 'aborted' ? '_(Stopped.)_' : '');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO messages(id, conversation_id, role, content, sources, provider_state)
       VALUES ($1, $2, 'assistant', $3, $4, $5)`,
      [
        id,
        conversationId,
        content,
        JSON.stringify(sources),
        result.providerState === undefined ? null : JSON.stringify(result.providerState),
      ],
    );
    if (result.steps.length)
      await client.query(
        `INSERT INTO agent_steps(message_id, seq, kind, payload, started_at, ended_at)
         SELECT $1, s.seq, s.kind, s.payload, s.started_at, s.ended_at
         FROM jsonb_to_recordset($2::jsonb) AS s(seq int, kind text, payload jsonb, started_at timestamptz, ended_at timestamptz)`,
        [
          id,
          JSON.stringify(
            result.steps.map((s) => ({
              seq: s.seq,
              kind: s.kind,
              payload: s.payload,
              started_at: s.startedAt.toISOString(),
              ended_at: s.endedAt?.toISOString() ?? null,
            })),
          ),
        ],
      );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function thumbKeys(pool: pg.Pool, userId: string, chunkIds: string[]) {
  if (!chunkIds.length) return new Map<string, string | null>();
  const result = await pool.query<{ id: string; thumb_r2_key: string | null }>(
    'SELECT id, thumb_r2_key FROM chunks WHERE user_id = $1 AND id = ANY($2::uuid[])',
    [userId, chunkIds],
  );
  return new Map(result.rows.map((r) => [r.id, r.thumb_r2_key]));
}

async function wireSource(
  s: StoredSource,
  thumbs: Map<string, string | null>,
  storage: Pick<R2, 'signGet'>,
): Promise<Source> {
  const key = thumbs.get(s.chunk_id);
  return {
    sid: s.sid,
    chunkId: s.chunk_id,
    fileName: s.file_name,
    modality: s.modality,
    location: s.location,
    thumbUrl: key ? await storage.signGet(key).catch(() => null) : null,
  };
}
