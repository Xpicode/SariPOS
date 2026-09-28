import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError';
import { verifyAccessToken } from '../utils/tokens';

export const auth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHORIZED', 'Login required');

  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: Number(payload.sub), role: payload.role };
  } catch {
    throw new AppError(401, 'TOKEN_INVALID', 'Session expired');
  }
  next();
};
