import { z } from 'zod';
import { MAX_CENTAVOS } from '../products/products.schema';

const name = z.string().trim().min(2, 'Enter the customer’s name').max(100, 'Name is too long');

// Philippine mobile, stored one way: "0917 123 4567", "+63 917-123-4567" -> "09171234567".
export const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^\+?63(?=9)/, '0'))
  .pipe(z.string().regex(/^09\d{9}$/, 'Use a mobile number like 0917 123 4567'));

const address = z.string().trim().max(255, 'Address is too long');
const creditLimit = z
  .number()
  .int()
  .min(0, 'The limit can’t be negative')
  .max(MAX_CENTAVOS, 'That limit is too large');

export const createCustomerSchema = z.object({
  name,
  phone: phone.optional(),
  address: address.optional(),
  creditLimit: creditLimit.optional(), // owner only (checked in the service); default ₱500
});

export const updateCustomerSchema = z
  .object({
    name: name.optional(),
    phone: phone.nullable().optional(), // null = remove
    address: address.nullable().optional(),
    creditLimit: creditLimit.optional(),
    isBlocked: z.boolean().optional(),
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), 'Nothing to update');

export const paymentSchema = z.object({
  idempotencyKey: z.uuid('Invalid request key'), // made when the payment dialog opens
  amount: z.number().int().min(1, 'Enter the amount').max(MAX_CENTAVOS, 'That amount is too large'),
});

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
