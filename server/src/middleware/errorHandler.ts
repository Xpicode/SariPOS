import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export const notFound: RequestHandler = () => {
  throw new AppError(404, 'NOT_FOUND', 'Route not found');
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // Client mistakes raised by Express itself: broken JSON (400), body over 100kb (413).
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: { code: 'BAD_REQUEST', message: 'Invalid request' } });
    return;
  }
  logger.error(err); // full detail in server logs only
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
