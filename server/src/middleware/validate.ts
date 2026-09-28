import type { RequestHandler } from 'express';
import { z, type ZodType } from 'zod';
import { AppError } from '../utils/AppError';

const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

// For URL ids like /users/:id. "abc", "-1" or "1.5" never reach the database.
export function parseId(value: unknown): number {
  const result = idSchema.safeParse(value);
  if (!result.success) throw new AppError(404, 'NOT_FOUND', 'Not found');
  return result.data;
}

// Validate anything (body, query string) or throw a 400 with the first problem.
// Use this for req.query: Express 5 makes req.query read-only, so it can't be replaced.
export function parseInput<T extends ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(400, 'VALIDATION_ERROR', result.error.issues[0]?.message ?? 'Invalid input');
  }
  return result.data;
}

export const validate =
  (schema: ZodType): RequestHandler =>
  (req, _res, next) => {
    req.body = parseInput(schema, req.body); // only validated, typed data continues
    next();
  };
