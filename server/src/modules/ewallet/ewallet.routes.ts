import { Router } from 'express';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as c from './ewallet.controller';
import {
  feePreviewSchema,
  feeRulesSchema,
  transactionSchema,
  updateAccountSchema,
} from './ewallet.schema';

const owner = requireRole('OWNER');

// The bantay does cash-in, cash-out and load at the counter. Fees, wallet settings and moving
// float (top-up / withdraw, checked in the service) are the owner's.
export const ewalletRouter = Router();
ewalletRouter.use(auth);
ewalletRouter.get('/accounts', c.accounts);
ewalletRouter.patch('/accounts/:id', owner, validate(updateAccountSchema), c.updateAccount);
ewalletRouter.post('/fee-preview', validate(feePreviewSchema), c.feePreview);
ewalletRouter.get('/transactions', c.listTransactions);
ewalletRouter.post('/transactions', validate(transactionSchema), c.createTransaction);
ewalletRouter.get('/fee-rules', owner, c.feeRules);
ewalletRouter.put('/fee-rules', owner, validate(feeRulesSchema), c.saveFeeRules);
