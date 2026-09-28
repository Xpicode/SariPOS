import { Router } from 'express';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as c from './customers.controller';
import { createCustomerSchema, paymentSchema, updateCustomerSchema } from './customers.schema';

const owner = requireRole('OWNER');

// The bantay adds customers, looks up balances, receives payments and sets the terms (due date,
// interest). Limits, blocking, charging the interest and the aging report are the owner's.
export const customersRouter = Router();
customersRouter.use(auth);
customersRouter.get('/', c.list);
customersRouter.post('/', validate(createCustomerSchema), c.create);
customersRouter.get('/aging', owner, c.aging); // before '/:id...'
customersRouter.get('/:id/ledger', c.ledger);
customersRouter.post('/:id/payments', validate(paymentSchema), c.pay);
customersRouter.post('/:id/interest', owner, c.addInterest);
// Cashiers may PATCH only dueDate / interestBp (checked in the service).
customersRouter.patch('/:id', validate(updateCustomerSchema), c.update);
