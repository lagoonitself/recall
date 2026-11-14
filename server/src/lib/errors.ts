import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ErrorResponseSchema } from '@app/shared';
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
 if (res.headersSent) return next(err);
 if (err instanceof ZodError) return res.status(400).json(ErrorResponseSchema.parse({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.flatten() } }));
 return res.status(500).json(ErrorResponseSchema.parse({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }));
};
