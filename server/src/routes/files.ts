import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type pg from 'pg';
import { ListFilesQuerySchema, UploadUrlRequestSchema } from '@app/shared';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { rateLimit } from '../lib/rateLimit.js';
import { validate } from '../lib/validation.js';
import type { R2 } from '../lib/r2.js';
import { filePrefix, fileResponse, mimeInfo } from '../services/files.js';

const params = z.object({ id: z.uuid() });
const missing = () => new HttpError(404, 'NOT_FOUND', 'File not found');
export type FileLimits = { maxFileMb: number; userQuotaMb: number; uploadsPerDay: number };
export function filesRouter(pool: () => pg.Pool, secret: string, storage: () => R2, limits: FileLimits) {
  const router = Router();
  router.use(requireAuth(secret));
  router.post(
    '/upload-url',
    rateLimit({ limit: 30, windowMs: 60000 }),
    validate({ body: UploadUrlRequestSchema }),
    async (req, res) => {
      const body = UploadUrlRequestSchema.parse(req.body);
      const info = mimeInfo(body.mimeType);
      if (!info || !body.name.trim() || body.sizeBytes > limits.maxFileMb * 1048576)
        throw new HttpError(400, 'INVALID_FILE', 'Unsupported file or size');
      const id = randomUUID();
      const key = filePrefix(req.user!.id, id) + 'original.' + info.ext;
      const client = await pool().connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
        const collection = await client.query('SELECT id FROM collections WHERE id = $1 AND user_id = $2', [
          body.collectionId,
          req.user!.id,
        ]);
        if (!collection.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Collection not found');
        const usage = await client.query(
          'SELECT COALESCE(sum(size_bytes), 0)::bigint AS bytes FROM files WHERE user_id = $1',
          [req.user!.id],
        );
        const uploads = await client.query(
          `SELECT count(*)::int AS count FROM upload_events WHERE user_id = $1 AND created_at > now() - interval '24 hours'`,
          [req.user!.id],
        );
        if (
          Number(usage.rows[0].bytes) + body.sizeBytes > limits.userQuotaMb * 1048576 ||
          uploads.rows[0].count >= limits.uploadsPerDay
        )
          throw new HttpError(429, 'QUOTA_EXCEEDED', 'Upload limit exceeded');
        await client.query(
          'INSERT INTO files(id,user_id,collection_id,name,mime_type,modality,size_bytes,r2_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [id, req.user!.id, body.collectionId, body.name, body.mimeType, info.modality, body.sizeBytes, key],
        );
        await client.query('INSERT INTO upload_events(user_id) VALUES ($1)', [req.user!.id]);
        const url = await storage().signPut(key, body.mimeType, body.sizeBytes);
        await client.query('COMMIT');
        res.status(201).json({
          fileId: id,
          url,
          headers: { 'Content-Type': body.mimeType, 'Content-Length': String(body.sizeBytes) },
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );
  router.post('/:id/complete', validate({ params }), async (req, res) => {
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM files WHERE id = $1 AND user_id = $2 FOR UPDATE', [
        req.params.id,
        req.user!.id,
      ]);
      if (!result.rowCount) throw missing();
      const file = result.rows[0];
      if (file.status !== 'uploading') throw new HttpError(409, 'CONFLICT', 'File is not uploading');
      let object;
      try {
        object = await storage().head(file.r2_key);
      } catch (error) {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('$metadata' in error) ||
          (error.$metadata as { httpStatusCode?: number }).httpStatusCode !== 404
        )
          throw error;
      }
      if (
        !object ||
        object.ContentLength !== Number(file.size_bytes) ||
        object.ContentType !== file.mime_type
      ) {
        await client.query(
          `UPDATE files SET status = 'failed', error = 'Uploaded object does not match' WHERE id = $1 AND user_id = $2`,
          [file.id, req.user!.id],
        );
        await client.query('COMMIT');
        return res
          .status(400)
          .json({ error: { code: 'INVALID_UPLOAD', message: 'Uploaded object does not match' } });
      }
      const updated = await client.query(
        `UPDATE files SET status = 'queued' WHERE id = $1 AND user_id = $2 RETURNING *`,
        [file.id, req.user!.id],
      );
      await client.query('INSERT INTO jobs(file_id) VALUES ($1)', [file.id]);
      await client.query('COMMIT');
      return res.json({ file: fileResponse(updated.rows[0]) });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
  router.get('/', validate({ query: ListFilesQuerySchema }), async (req, res) => {
    const { collectionId } = ListFilesQuerySchema.parse(req.query);
    if (
      collectionId &&
      !(
        await pool().query('SELECT id FROM collections WHERE id=$1 AND user_id=$2', [
          collectionId,
          req.user!.id,
        ])
      ).rowCount
    )
      throw new HttpError(404, 'NOT_FOUND', 'Collection not found');
    const result = await pool().query(
      'SELECT * FROM files WHERE user_id=$1 AND ($2::uuid IS NULL OR collection_id=$2) ORDER BY created_at DESC, id',
      [req.user!.id, collectionId ?? null],
    );
    res.json({ files: result.rows.map(fileResponse) });
  });
  router.get('/:id', validate({ params }), async (req, res) => {
    const result = await pool().query('SELECT * FROM files WHERE id=$1 AND user_id=$2', [
      req.params.id,
      req.user!.id,
    ]);
    if (!result.rowCount) throw missing();
    res.json({ file: fileResponse(result.rows[0]) });
  });
  router.delete('/:id', validate({ params }), async (req, res) => {
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT id FROM files WHERE id=$1 AND user_id=$2 FOR UPDATE', [
        req.params.id,
        req.user!.id,
      ]);
      if (!result.rowCount) throw missing();
      await storage().deletePrefix(filePrefix(req.user!.id, req.params.id as string));
      await client.query('DELETE FROM files WHERE id=$1 AND user_id=$2', [req.params.id, req.user!.id]);
      await client.query('COMMIT');
      res.sendStatus(204);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
  return router;
}
