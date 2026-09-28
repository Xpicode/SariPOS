import { z } from 'zod';
import { passwordSchema, pinSchema, usernameSchema } from '../auth/auth.schema';

const fullNameSchema = z.string().trim().min(1, 'Enter a name').max(100);
const roleSchema = z.enum(['OWNER', 'CASHIER']);

// z.object() drops unknown keys, so extra fields like "failed_logins" can't be smuggled in.
export const createUserSchema = z.object({
  username: usernameSchema,
  fullName: fullNameSchema,
  password: passwordSchema,
  role: roleSchema,
  pin: pinSchema.optional(),
});

export const updateUserSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(), // owner resets a forgotten password
    pin: pinSchema.nullable().optional(), // null removes the PIN
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), 'Nothing to update');

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
