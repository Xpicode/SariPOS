import type { CookieOptions, RequestHandler, Response } from 'express';
import { env } from '../../config/env';
import type { LoginInput, VerifyPinInput } from './auth.schema';
import * as authService from './auth.service';

const REFRESH_COOKIE = 'refresh_token';

const cookieOptions: CookieOptions = {
  httpOnly: true, // JavaScript can't read it, so an XSS bug can't steal it
  secure: env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'strict', // never sent on requests started by another website (blocks CSRF)
  path: '/api/v1/auth', // only sent to auth routes, not with every API call
};

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, {
    ...cookieOptions,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

export const login: RequestHandler = async (req, res) => {
  const { username, password } = req.body as LoginInput;
  const { accessToken, refreshToken, user } = await authService.login(username, password, req.ip);
  setRefreshCookie(res, refreshToken);
  res.json({ data: { accessToken, user } }); // access token in the body -> kept in React memory only
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    const { accessToken, refreshToken, user } = await authService.refresh(
      req.cookies?.[REFRESH_COOKIE],
      req.ip,
    );
    setRefreshCookie(res, refreshToken);
    res.json({ data: { accessToken, user } });
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions); // a dead cookie is useless: remove it
    throw err;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE], req.ip);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
};

export const me: RequestHandler = async (req, res) => {
  res.json({ data: { user: await authService.me(req.user!.id) } });
};

export const verifyPin: RequestHandler = async (req, res) => {
  const { pin } = req.body as VerifyPinInput;
  const ownerId = await authService.verifyOwnerPin(pin, req.user!.id, req.ip);
  res.json({ data: { approved: true, ownerId } });
};
