import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const FIFTEEN_MIN = 15 * 60 * 1000;

const tooMany = (message: string) => ({ error: { code: 'TOO_MANY_REQUESTS', message } });

// ponytail: in-memory counters reset on restart and aren't shared between servers.
// Fine for one API instance; switch to a Redis store if you ever run several.

// Login: 5 failed tries per 15 min per IP + username (plan 8.2 A07).
// ipKeyGenerator groups IPv6 addresses by subnet, so an attacker can't rotate through
// the billions of addresses in their own IPv6 block to get fresh attempts.
export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: 5,
  skipSuccessfulRequests: true, // a cashier logging in normally never uses up tries
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    return `${ipKeyGenerator(req.ip ?? '')}:${username.trim().toLowerCase().slice(0, 50)}`;
  },
  message: tooMany('Too many login attempts. Try again in 15 minutes.'),
});

// Per IP across all usernames: stops one machine guessing many accounts ("password spraying").
export const loginIpLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: tooMany('Too many login attempts from this device. Try again later.'),
});

// Everything else: 300 requests a minute per IP (5 a second, far above a busy counter).
// Slows down anyone scripting the API: scraping every sale, or hammering it to slow the store.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: tooMany('Too many requests. Wait a minute and try again.'),
});

// Owner PIN: a 4-digit PIN has only 10,000 combinations, so guesses must be scarce.
// Keyed by the logged-in user (use after `auth`).
export const pinLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: Request) => `user:${req.user?.id}`,
  message: tooMany('Too many wrong PINs. Try again in 15 minutes.'),
});
