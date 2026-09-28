import { Router, type RequestHandler } from 'express';
import { env } from '../../config/env';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import * as c from './users.controller';
import { createUserSchema, updateUserSchema } from './users.schema';

export const usersRouter = Router();

// Every route below: logged in AND owner. Checked on the server; hiding a menu item isn't security.
usersRouter.use(auth, requireRole('OWNER'));

// Public demo: everyone shares owner_demo, so one visitor changing its password (or deactivating
// cashier_demo) would lock every later visitor out until the nightly reset. Look, don't touch.
const notInDemo: RequestHandler = (_req, _res, next) => {
  if (env.DEMO_MODE)
    throw new AppError(403, 'DEMO_READ_ONLY', 'User accounts can’t be changed in the demo');
  next();
};

usersRouter.get('/', c.list);
usersRouter.post('/', notInDemo, validate(createUserSchema), c.create);
usersRouter.patch('/:id', notInDemo, validate(updateUserSchema), c.update);
