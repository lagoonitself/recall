import { Router } from 'express';
import { z } from 'zod';
import type pg from 'pg';
import {
  AnalyzeCollectionRequestSchema,
  DocInsightsQuerySchema,
  ReviewRequestSchema,
  type DocInsight,
} from '@app/shared';
import { requireAuth } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { rateLimit } from '../lib/rateLimit.js';
import { validate } from '../lib/validation.js';
import { DOCUMENT_MODALITIES, markPending } from '../documents/analyze.js';
import { docType } from '../documents/catalog.js';
import type { DocumentQueue } from '../documents/queue.js';

const params = z.object({ id: z.uuid() });

type Row = {
  file_id: string;
  collection_id: string;
  file_name: string;
  modality: DocInsight['modality'];
  status: DocInsight['status'];
  doc_type: string | null;
  type_confidence: number | null;
  type_probabilities: Record<string, number>;
  summary: string | null;
  fields: DocInsight['fields'];
  checks: DocInsight['checks'];
  quality: number | null;
  risk_score: number | null;
  review_status: DocInsight['reviewStatus'];
  review_reasons: string[];
  error: string | null;
  analyzed_at: Date | null;
  updated_at: Date;
};

const SELECT = `SELECT d.*, f.name AS file_name, f.modality FROM doc_insights d
  JOIN files f ON f.id = d.file_id AND f.user_id = d.user_id`;

export function insightResponse(row: Row): DocInsight {
  return {
    fileId: row.file_id,
    collectionId: row.collection_id,
    fileName: row.file_name,
    modality: row.modality,
    status: row.status,
    docType: row.doc_type,
    docTypeLabel: row.doc_type ? docType(row.doc_type).label : null,
    typeConfidence: row.type_confidence,
    typeProbabilities: row.type_probabilities ?? {},
    summary: row.summary,
    fields: row.fields ?? [],
    checks: row.checks ?? [],
    quality: row.quality,
    riskScore: row.risk_score,
    reviewStatus: row.review_status,
    reviewReasons: row.review_reasons ?? [],
    error: row.error,
    analyzedAt: row.analyzed_at ? new Date(row.analyzed_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function documentsRouter(pool: () => pg.Pool, secret: string, queue: () => DocumentQueue) {
  const router = Router();
  router.use(requireAuth(secret));

  router.get('/', validate({ query: DocInsightsQuerySchema }), async (req, res) => {
    const { collectionId } = DocInsightsQuerySchema.parse(req.query);
    const [rows, missing] = await Promise.all([
      pool().query<Row>(
        `${SELECT} WHERE d.user_id = $1 AND d.collection_id = $2 ORDER BY f.created_at DESC`,
        [req.user!.id, collectionId],
      ),
      pool().query<{ count: number }>(
        `SELECT count(*)::int AS count FROM files f
          WHERE f.user_id = $1 AND f.collection_id = $2 AND f.status = 'ready' AND f.modality = ANY($3)
            AND NOT EXISTS (SELECT 1 FROM doc_insights d WHERE d.file_id = f.id)`,
        [req.user!.id, collectionId, DOCUMENT_MODALITIES],
      ),
    ]);
    res.json({ documents: rows.rows.map(insightResponse), unanalyzed: missing.rows[0].count });
  });

  router.post(
    '/analyze-collection',
    rateLimit({ limit: 10, windowMs: 60000 }),
    validate({ body: AnalyzeCollectionRequestSchema }),
    async (req, res) => {
      const { collectionId } = AnalyzeCollectionRequestSchema.parse(req.body);
      const files = await pool().query<{ id: string }>(
        `SELECT f.id FROM files f
          WHERE f.user_id = $1 AND f.collection_id = $2 AND f.status = 'ready' AND f.modality = ANY($3)
            AND NOT EXISTS (SELECT 1 FROM doc_insights d WHERE d.file_id = f.id AND d.status <> 'failed')
          ORDER BY f.created_at LIMIT 50`,
        [req.user!.id, collectionId, DOCUMENT_MODALITIES],
      );
      for (const file of files.rows) {
        await markPending(pool(), file.id);
        queue().enqueue(file.id);
      }
      res.status(202).json({ queued: files.rowCount ?? 0 });
    },
  );

  router.get('/:id', validate({ params }), async (req, res) => {
    const result = await pool().query<Row>(`${SELECT} WHERE d.file_id = $1 AND d.user_id = $2`, [
      req.params.id,
      req.user!.id,
    ]);
    if (!result.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Document not analysed');
    res.json({ document: insightResponse(result.rows[0]) });
  });

  router.post(
    '/:id/analyze',
    rateLimit({ limit: 20, windowMs: 60000 }),
    validate({ params }),
    async (req, res) => {
      const file = await pool().query<{ status: string; modality: string }>(
        'SELECT status, modality FROM files WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user!.id],
      );
      const row = file.rows[0];
      if (!row) throw new HttpError(404, 'NOT_FOUND', 'File not found');
      if (row.status !== 'ready' || !DOCUMENT_MODALITIES.includes(row.modality as never))
        throw new HttpError(400, 'NOT_A_DOCUMENT', 'Only ready PDF, image and text files can be analysed');
      await markPending(pool(), req.params.id as string);
      queue().enqueue(req.params.id as string);
      const result = await pool().query<Row>(`${SELECT} WHERE d.file_id = $1`, [req.params.id]);
      res.status(202).json({ document: insightResponse(result.rows[0]) });
    },
  );

  router.patch('/:id/review', validate({ params, body: ReviewRequestSchema }), async (req, res) => {
    const { status } = ReviewRequestSchema.parse(req.body);
    const result = await pool().query<Row>(
      `WITH updated AS (
         UPDATE doc_insights SET review_status = $3, updated_at = now()
          WHERE file_id = $1 AND user_id = $2 AND status = 'ready' RETURNING *
       ) SELECT u.*, f.name AS file_name, f.modality FROM updated u JOIN files f ON f.id = u.file_id`,
      [req.params.id, req.user!.id, status],
    );
    if (!result.rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Document not analysed');
    res.json({ document: insightResponse(result.rows[0]) });
  });

  return router;
}
