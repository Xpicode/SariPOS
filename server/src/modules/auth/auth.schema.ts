import { z } from 'zod';

// Same rule as the users.username CHECK in migration 0001.
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,50}$/, 'Username: 3-50 lowercase letters, numbers, _ or .');

// max(128): argon2 accepts any length, but there's no reason to hash a 100kb "password".
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

export const pinSchema = z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 digits');

// No format rules on login input: a badly formatted username is simply a wrong login.
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Enter your username').max(50),
  password: z.string().min(1, 'Enter your password').max(128),
});

export const verifyPinSchema = z.object({ pin: pinSchema });

export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyPinInput = z.infer<typeof verifyPinSchema>;
