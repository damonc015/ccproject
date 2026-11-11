import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
  } else if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid request data.', details:
      error.issues.map(({ path, message }) => ({ path: path.join('.'), message })) } });
  } else if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Body must be valid JSON.' } });
  } else if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large.' } });
  } else {
    console.error('Unhandled API error:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } });
  }
};
