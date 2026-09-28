import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '../types/express';

export function signAccessToken(user: { id: number; role: Role }) {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: String(user.id),
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload & {
    role: Role;
  };
}

export const generateRefreshToken = () => crypto.randomBytes(64).toString('base64url');

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
