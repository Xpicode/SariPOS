import { Router } from 'express';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as c from './inventory.controller';
import { adjustSchema, stockInSchema } from './inventory.schema';

const owner = requireRole('OWNER');

export const inventoryRouter = Router();
inventoryRouter.use(auth);
inventoryRouter.post('/stock-in', owner, validate(stockInSchema), c.stockIn);
inventoryRouter.post('/adjust', owner, validate(adjustSchema), c.adjust);
inventoryRouter.get('/movements', owner, c.movements);
inventoryRouter.get('/expiring', c.expiring); // everyone: the bantay should pull expired items too
