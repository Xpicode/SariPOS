import { Router } from 'express';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as c from './users.controller';
import { createUserSchema, updateUserSchema } from './users.schema';

export const usersRouter = Router();

// Every route below: logged in AND owner. Checked on the server; hiding a menu item isn't security.
usersRouter.use(auth, requireRole('OWNER'));

usersRouter.get('/', c.list);
usersRouter.post('/', validate(createUserSchema), c.create);
usersRouter.patch('/:id', validate(updateUserSchema), c.update);
