import { z } from 'zod';
import { phone } from '../customers/customers.schema';
import { MAX_CENTAVOS } from '../products/products.schema';

// Same list as the eload_telco CHECK in migration 0010.
export const TELCOS = ['GLOBE', 'TM', 'SMART', 'TNT', 'DITO'] as const;

const amount = z
  .number()
  .int()
  .min(1, 'Enter the amount')
  .max(MAX_CENTAVOS, 'That amount is too large');
const accountId = z.number().int().positive('Pick the wallet');
// Spaces removed first: GCash shows refs as "1009 876 543 210".
const referenceNo = z
  .string()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^[0-9A-Za-z-]{4,40}$/, 'Enter the reference number from the receipt'));

// The client says WHAT happened (type, wallet, amount). The fee and both pocket changes are
// computed by the server (fee.ts), never taken from the request.
const base = {
  idempotencyKey: z.uuid('Invalid request key'), // made when the dialog opens: double tap = 1 row
  accountId,
  amount,
  // The fee the customer was SHOWN. Only compared: if the owner changed the fee rules meanwhile,
  // the transaction is refused instead of charging a fee nobody agreed to.
  expectedFee: z.number().int().min(0).optional(),
};

export const transactionSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('CASH_IN'), customerNumber: phone, referenceNo }),
  z.object({
    ...base,
    type: z.literal('CASH_OUT'),
    customerNumber: phone.optional(),
    referenceNo,
  }),
  z.object({
    ...base,
    type: z.literal('ELOAD'),
    telco: z.enum(TELCOS, 'Pick the network'),
    customerNumber: phone,
    referenceNo: referenceNo.optional(),
  }),
  // Owner only (checked in the service). drawer = the cash comes from / goes into the drawer.
  z.object({
    ...base,
    type: z.literal('TOP_UP'),
    drawer: z.boolean(),
    referenceNo: referenceNo.optional(),
  }),
  z.object({
    ...base,
    type: z.literal('WITHDRAW'),
    drawer: z.boolean(),
    referenceNo: referenceNo.optional(),
  }),
]);

export const feePreviewSchema = z.object({
  accountId,
  type: z.enum(['CASH_IN', 'CASH_OUT', 'ELOAD', 'TOP_UP', 'WITHDRAW']),
  amount,
  drawer: z.boolean().optional(),
});

export const updateAccountSchema = z
  .object({
    lowBalanceAlert: z
      .number()
      .int()
      .min(0)
      .max(MAX_CENTAVOS, 'That amount is too large')
      .optional(),
    commissionBp: z.number().int().min(0).max(5000, 'At most 50%').optional(),
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), 'Nothing to update');

// The owner lists brackets as "up to ₱X, fee ₱Y", lowest first. Each bracket starts right after
// the one before (the first at ₱0.01), so there are no gaps and no overlaps to get wrong.
export const feeRulesSchema = z.object({
  walletKind: z.enum(['GCASH', 'MAYA']),
  txnType: z.enum(['CASH_IN', 'CASH_OUT']),
  brackets: z
    .array(
      z.object({
        upTo: amount,
        fee: z.number().int().min(0, 'The fee can’t be negative').max(MAX_CENTAVOS),
      }),
    )
    .min(1, 'Add at least one bracket')
    .max(100, 'Too many brackets')
    .refine(
      (b) => b.every((x, i) => i === 0 || x.upTo > b[i - 1].upTo),
      'Each “up to” amount must be higher than the one above it',
    ),
});

export type TransactionInput = z.infer<typeof transactionSchema>;
export type FeePreviewInput = z.infer<typeof feePreviewSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type FeeRulesInput = z.infer<typeof feeRulesSchema>;
