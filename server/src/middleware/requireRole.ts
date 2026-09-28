import type { RequestHandler } from 'express';
import type { Role } from '../types/express';
import { AppError } from '../utils/AppError';

// Use AFTER `auth`. auth answers "who are you?", requireRole answers "are you allowed?".
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You are not allowed to do this');
    }
    next();
  };
