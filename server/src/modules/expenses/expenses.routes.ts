import { Router } from 'express';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as c from './expenses.controller';
import { createExpenseSchema } from './expenses.schema';

// Everyone records (the service limits what a cashier may record); only the owner lists.
export const expensesRouter = Router();
expensesRouter.use(auth);
expensesRouter.post('/', validate(createExpenseSchema), c.create);
expensesRouter.get('/', requireRole('OWNER'), c.list);
