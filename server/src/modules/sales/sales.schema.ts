import { z } from 'zod';
import { pinSchema } from '../auth/auth.schema';
import { MAX_CENTAVOS } from '../products/products.schema';

// What the client may say about an item: WHICH unit and HOW MANY. Nothing else.
// z.object() drops unknown keys, so a tampered { price: 0 } never reaches the service:
// prices always come from the database (plan 6.2).
const itemSchema = z.object({
  productUnitId: z.number().int().positive(),
  qty: z.number().int().min(1, 'Quantity must be at least 1').max(10_000, 'Quantity is too large'),
});

export const createSaleSchema = z.object({
  // Made by the browser when the payment dialog opens. Same key again = same sale (double tap,
  // or a retry after the wifi dropped mid-request), never a second one.
  idempotencyKey: z.uuid('Invalid request key'),
  items: z
    .array(itemSchema)
    .min(1, 'The cart is empty')
    .max(100, 'Too many different items in one sale')
    .refine(
      (items) => new Set(items.map((i) => i.productUnitId)).size === items.length,
      'The same item is in the cart twice',
    ),
  payment: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('CASH'),
      amountTendered: z.number().int().min(0).max(MAX_CENTAVOS, 'That amount is too large'),
    }),
    z.object({
      type: z.literal('GCASH'),
      gcashRefNo: z
        .string()
        .trim()
        .regex(/^[0-9A-Za-z-]{4,40}$/, 'Enter the reference number from the GCash receipt'),
    }),
    z.object({
      type: z.literal('UTANG'),
      customerId: z.number().int().positive('Pick the customer'),
    }),
  ]),
  // The total the customer was SHOWN. Never used as the price, only compared: if the owner
  // changed a price while the item sat in the cart, the sale is refused instead of silently
  // charging an amount the customer never agreed to (or a GCash payment not matching the sale).
  expectedTotal: z.number().int().min(0).optional(),
});

export const voidSaleSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Write a short reason (at least 3 characters)')
    .max(255, 'Reason is too long'),
  pin: pinSchema.optional(), // required for cashiers; owners are approved by their own login
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type VoidSaleInput = z.infer<typeof voidSaleSchema>;
