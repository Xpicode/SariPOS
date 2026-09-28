import { Router } from 'express';
import { auth } from '../../middleware/auth';
import { loginIpLimiter, loginLimiter, pinLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import * as c from './auth.controller';
import { loginSchema, verifyPinSchema } from './auth.schema';

export const authRouter = Router();

// (Token responses are never cached: app.ts sets Cache-Control: no-store on every response.)
authRouter.post('/login', loginIpLimiter, loginLimiter, validate(loginSchema), c.login);
authRouter.post('/refresh', c.refresh); // authenticated by the httpOnly cookie
authRouter.post('/logout', c.logout); // cookie-based, so logout works even after the access token expired
authRouter.get('/me', auth, c.me);
authRouter.post('/verify-pin', auth, pinLimiter, validate(verifyPinSchema), c.verifyPin);
