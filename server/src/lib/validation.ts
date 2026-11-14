import type { RequestHandler } from 'express';
import type { z } from 'zod';

type Schemas = { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType };

/**
 * Validates body, query and params with Zod schemas from `@app/shared`.
 * Parsed values go to `res.locals.body`, `res.locals.query` and `res.locals.params`
 * (Express 5 makes `req.query` read-only). `req.body` is also replaced with the parsed body.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    for (const part of ['body', 'query', 'params'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) return next(result.error);
      res.locals[part] = result.data;
      if (part === 'body') req.body = result.data;
    }
    next();
  };
}

export function validateBody(schema: z.ZodType): RequestHandler {
  return validate({ body: schema });
}
