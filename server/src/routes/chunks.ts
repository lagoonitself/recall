import { Router } from 'express';
import { z } from 'zod';
import type pg from 'pg';
import { MediaQuerySchema } from '@app/shared';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { validate } from '../lib/validation.js';
import type { R2 } from '../lib/r2.js';

export function chunksRouter(pool: () => pg.Pool, secret: string, storage: () => R2) {
  const router = Router();
  router.use(requireAuth(secret));
  router.get(
    '/:id/media',
    validate({ params: z.object({ id: z.uuid() }), query: MediaQuerySchema }),
    async (req, res) => {
      const { thumbnail } = MediaQuerySchema.parse(req.query);
      const result = await pool().query(
        'SELECT r2_key, thumb_r2_key FROM chunks WHERE id=$1 AND user_id=$2',
        [req.params.id, req.user!.id],
      );
      const key = thumbnail === 'true' ? result.rows[0]?.thumb_r2_key : result.rows[0]?.r2_key;
      if (!key) throw new HttpError(404, 'NOT_FOUND', 'Media not found');
      res.json({ url: await storage().signGet(key) });
    },
  );
  return router;
}
