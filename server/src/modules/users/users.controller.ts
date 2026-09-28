import type { RequestHandler } from 'express';
import { parseId } from '../../middleware/validate';
import type { CreateUserInput, UpdateUserInput } from './users.schema';
import * as usersService from './users.service';

export const list: RequestHandler = async (_req, res) => {
  res.json({ data: { users: await usersService.listUsers() } });
};

export const create: RequestHandler = async (req, res) => {
  const user = await usersService.createUser(req.body as CreateUserInput, req.user!, req.ip);
  res.status(201).json({ data: { user } });
};

export const update: RequestHandler = async (req, res) => {
  const id = parseId(req.params.id);
  const user = await usersService.updateUser(id, req.body as UpdateUserInput, req.user!, req.ip);
  res.json({ data: { user } });
};
