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
// Utang terms. The due date is a store day (YYYY-MM-DD); the service refuses one already past.
const dueDate = z.iso.date('Pick a date');
// Interest if late, in basis points (500 = 5.00%). At most 50%.
const interestBp = z
  .number()
  .int()
  .min(0, 'The interest can’t be negative')
  .max(5000, 'At most 50%');
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
  dueDate: dueDate.optional(),
  interestBp: interestBp.optional(),
});

export const updateCustomerSchema = z
  .object({
    name: name.optional(),
    phone: phone.nullable().optional(), // null = remove
    address: address.nullable().optional(),
    creditLimit: creditLimit.optional(),
    isBlocked: z.boolean().optional(),
    dueDate: dueDate.nullable().optional(), // null = no date agreed
    interestBp: interestBp.optional(),
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
