import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import type { ErrorResponse } from '@app/shared';

/** Throw from any route to send `{ error: { code, message, details? } }` with `status`. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function send(res: Response, status: number, error: ErrorResponse['error']) {
  res.status(status).json({ error } satisfies ErrorResponse);
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

function clientStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null || !('status' in err)) return undefined;
  const status = (err as { status: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    return send(res, err.status, { code: err.code, message: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return send(res, 400, { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.flatten() });
  }
  // body-parser errors (malformed JSON, body too large) carry a 4xx status.
  const status = clientStatus(err);
  if (status) {
    return send(res, status, {
      code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
      message: 'Invalid request body',
    });
  }
  console.error(err);
  return send(res, 500, { code: 'INTERNAL_ERROR', message: 'Internal server error' });
};
