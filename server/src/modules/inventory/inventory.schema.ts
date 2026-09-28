import { z } from 'zod';
import { MAX_CENTAVOS } from '../products/products.schema';

const id = z.number().int().positive();
const reason = z
  .string()
  .trim()
  .min(3, 'Write a short reason (at least 3 characters)')
  .max(255, 'Reason is too long');

export const stockInSchema = z.object({
  productUnitId: id, // the unit that arrived (1 ream, 1 box...); converted to base units
  qty: z.number().int().min(1, 'Enter how many arrived').max(10_000, 'That’s too many at once'),
  costCentavos: z.number().int().min(0).max(MAX_CENTAVOS).optional(), // cost of ONE selected unit
  expiryDate: z.iso.date('Use a real date').optional(), // YYYY-MM-DD
  note: z.string().trim().max(255).optional(),
});

// Two kinds of correction, each asking for what the owner actually knows:
//   SPOILAGE:   "3 went bad"          -> remove 3
//   ADJUSTMENT: "I counted 17"        -> the system works out the difference
export const adjustSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SPOILAGE'),
    productId: id,
    qty: z.number().int().min(1, 'Enter how many to remove').max(100_000_000),
    reason,
  }),
  z.object({
    type: z.literal('ADJUSTMENT'),
    productId: id,
    countedQty: z.number().int().min(0, 'Count can’t be negative').max(100_000_000),
    reason,
  }),
]);

export const movementsQuerySchema = z.object({ productId: z.coerce.number().int().positive() });

export const expiringQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(7),
});

export type StockInInput = z.infer<typeof stockInSchema>;
export type AdjustInput = z.infer<typeof adjustSchema>;
