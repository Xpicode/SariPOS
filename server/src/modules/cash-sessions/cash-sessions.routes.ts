import { Router } from 'express';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as c from './cash-sessions.controller';
import { closeSessionSchema, openSessionSchema } from './cash-sessions.schema';

const owner = requireRole('OWNER');

// Owner or cashier opens and closes the shift (whoever is at the counter).
// Shift history and old Z-reports (with over/short) are for the owner.
export const cashSessionsRouter = Router();
cashSessionsRouter.use(auth);
cashSessionsRouter.get('/current', c.current); // before '/:id'
cashSessionsRouter.post('/open', validate(openSessionSchema), c.open);
cashSessionsRouter.post('/:id/close', validate(closeSessionSchema), c.close);
cashSessionsRouter.get('/', owner, c.list);
cashSessionsRouter.get('/:id', owner, c.report);
