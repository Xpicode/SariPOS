import { z } from 'zod';
import { MAX_CENTAVOS } from '../products/products.schema';

// Same list as the expense_category CHECK in migration 0008.
export const EXPENSE_CATEGORIES = [
  'SUPPLIES',
  'ELECTRIC',
  'WATER',
  'RENT',
  'TRANSPORT',
  'SALARY',
  'OTHER',
  'OWNER_WITHDRAWAL', // the owner taking money home: leaves the drawer, but isn't a business cost
] as const;

export const createExpenseSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORIES, 'Pick a category'),
    amount: z
      .number()
      .int()
      .min(1, 'Enter the amount')
      .max(MAX_CENTAVOS, 'That amount is too large'),
    paidFromDrawer: z.boolean(), // true = the cash came out of the drawer (counts at closing)
    note: z.string().trim().max(255, 'Note is too long').optional(),
  })
  .refine((e) => e.category !== 'OTHER' || (e.note?.length ?? 0) >= 3, {
    message: 'Say what it was for',
    path: ['note'],
  });

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
