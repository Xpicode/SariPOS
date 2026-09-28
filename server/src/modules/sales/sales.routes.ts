import { Router } from 'express';
import { auth } from '../../middleware/auth';
import { pinLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import * as c from './sales.controller';
import { createSaleSchema, voidSaleSchema } from './sales.schema';

// Owner and cashier both sell. What each may SEE is decided in the service
// (cashier: the open shift only). Voids by a cashier need an owner PIN.
export const salesRouter = Router();
salesRouter.use(auth);
salesRouter.post('/', validate(createSaleSchema), c.create);
salesRouter.get('/', c.list);
salesRouter.get('/:id', c.get);
salesRouter.post('/:id/void', pinLimiter, validate(voidSaleSchema), c.voidSale);
