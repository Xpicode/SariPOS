import { z } from 'zod';
import { MAX_CENTAVOS } from '../products/products.schema';

const cash = z
  .number()
  .int()
  .min(0, 'Cash can’t be negative')
  .max(MAX_CENTAVOS, 'That’s more than a drawer holds');

// Philippine bills and coins, in centavos: ₱1,000 … ₱1 and 25 sentimo. (₱20 is both a bill and
// a coin; they're counted together.)
export const DENOMINATIONS = [
  '100000', '50000', '20000', '10000', '5000', '2000', '1000', '500', '100', '25',
] as const; // prettier-ignore

export const openSessionSchema = z.object({ openingCash: cash });

export const closeSessionSchema = z
  .object({
    actualCash: cash,
    // How many of each bill/coin were counted. partialRecord: only known denominations, any
    // subset of them. Stored with the shift, so a disputed shortage can be re-checked later.
    cashCount: z
      .partialRecord(z.enum(DENOMINATIONS), z.number().int().min(0).max(100_000))
      .optional(),
    notes: z.string().trim().max(255, 'Notes are too long').optional(),
  })
  .refine(
    (b) =>
      !b.cashCount ||
      Object.entries(b.cashCount).reduce((sum, [d, n]) => sum + Number(d) * (n ?? 0), 0) ===
        b.actualCash,
    { message: 'The bill and coin count doesn’t add up to the total', path: ['cashCount'] },
  );

export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
