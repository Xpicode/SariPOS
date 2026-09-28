import { z } from 'zod';

const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

// ?userId=&action=&from=&to=&beforeId=  (all optional). The action is matched exactly, never
// pattern-matched, and only in the shape the app writes (LOGIN_FAILED, SALE_VOID…).
export const auditQuerySchema = z
  .object({
    userId: id.optional(),
    action: z
      .string()
      .regex(/^[A-Z_]{1,60}$/, 'Unknown action')
      .optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    beforeId: id.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, '"from" must be on or before "to"');

export type AuditQuery = z.infer<typeof auditQuerySchema>;
