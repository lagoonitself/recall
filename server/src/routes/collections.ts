import { Router } from 'express';
import { z } from 'zod';
import type pg from 'pg';
import { CreateCollectionRequestSchema, UpdateCollectionRequestSchema } from '@app/shared';
import { validate } from '../lib/validation.js';
import { HttpError } from '../lib/errors.js';
import { requireAuth } from '../lib/auth.js';
import type { R2 } from '../lib/r2.js';
import { filePrefix } from '../services/files.js';

type Row = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: Date;
  file_count?: number;
};
const collection = (row: Row) => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  description: row.description,
  createdAt: row.created_at.toISOString(),
  ...(row.file_count === undefined ? {} : { fileCount: Number(row.file_count) }),
});
const params = z.object({ id: z.uuid() });
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Collection not found');
function conflict(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
    throw new HttpError(409, 'CONFLICT', 'Collection name already exists');
  throw error;
}
export function collectionsRouter(pool: () => pg.Pool, secret: string, storage: () => R2) {
  const router = Router();
  router.use(requireAuth(secret));
  router.get('/', async (req, res) => {
    const result = await pool().query(
      'SELECT c.*, count(f.id)::int AS file_count FROM collections c LEFT JOIN files f ON f.collection_id = c.id AND f.user_id = c.user_id WHERE c.user_id = $1 GROUP BY c.id ORDER BY c.created_at, c.id',
      [req.user!.id],
    );
    res.json({ collections: result.rows.map(collection) });
  });
  router.post('/', validate({ body: CreateCollectionRequestSchema }), async (req, res) => {
    const { name, description } = CreateCollectionRequestSchema.parse(req.body);
    try {
      const result = await pool().query(
        'INSERT INTO collections(user_id, name, description) VALUES ($1,$2,$3) RETURNING *',
        [req.user!.id, name, description ?? null],
      );
      res.status(201).json({ collection: collection(result.rows[0]) });
    } catch (error) {
      conflict(error);
    }
  });
  router.patch('/:id', validate({ params, body: UpdateCollectionRequestSchema }), async (req, res) => {
    const body = UpdateCollectionRequestSchema.parse(req.body);
    try {
      const result = await pool().query(
        'UPDATE collections SET name = CASE WHEN $3 THEN $4 ELSE name END, description = CASE WHEN $5 THEN $6 ELSE description END WHERE id = $1 AND user_id = $2 RETURNING *',
        [
          req.params.id,
          req.user!.id,
          body.name !== undefined,
          body.name ?? null,
          body.description !== undefined,
          body.description ?? null,
        ],
      );
      if (!result.rowCount) throw notFound();
      res.json({ collection: collection(result.rows[0]) });
    } catch (error) {
      conflict(error);
    }
  });
  router.delete('/:id', validate({ params }), async (req, res) => {
    // Postgres cascades the file rows, but R2 objects must be removed explicitly or they are orphaned.
    const client = await pool().connect();
    let keysToDelete: string[] = [];
    const prefixesToDelete: string[] = [];
    try {
      await client.query('BEGIN');
      const owned = await client.query(
        'SELECT id FROM collections WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [req.params.id, req.user!.id],
      );
      if (!owned.rowCount) throw notFound();
      const files = await client.query(
        'SELECT id, r2_key FROM files WHERE collection_id = $1 AND user_id = $2 FOR UPDATE',
        [req.params.id, req.user!.id],
      );
      const chunks = await client.query(
        'SELECT r2_key, thumb_r2_key FROM chunks WHERE collection_id = $1 AND user_id = $2',
        [req.params.id, req.user!.id],
      );
      const keys = new Set<string>();
      for (const file of files.rows as { id: string; r2_key: string }[]) {
        if (file.r2_key) keys.add(file.r2_key);
        prefixesToDelete.push(filePrefix(req.user!.id, file.id));
      }
      for (const chunk of chunks.rows as { r2_key?: string; thumb_r2_key?: string }[]) {
        if (chunk.r2_key) keys.add(chunk.r2_key);
        if (chunk.thumb_r2_key) keys.add(chunk.thumb_r2_key);
      }
      keysToDelete = Array.from(keys);

      await client.query('DELETE FROM collections WHERE id = $1 AND user_id = $2', [
        req.params.id,
        req.user!.id,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    try {
      if (keysToDelete.length > 0) {
        await storage().deleteObjects(keysToDelete);
      }
      for (const prefix of prefixesToDelete) {
        await storage().deletePrefix(prefix);
      }
    } catch (error) {
      console.error('Failed to clean up R2 objects for collection', req.params.id, error);
    }
    res.sendStatus(204);
  });
  return router;
}
