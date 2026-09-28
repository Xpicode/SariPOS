import type { RequestHandler } from 'express';
import { parseInput } from '../../middleware/validate';
import { dateRangeSchema } from '../../utils/dateRange';
import type { CreateExpenseInput } from './expenses.schema';
import * as service from './expenses.service';

export const create: RequestHandler = async (req, res) => {
  const expense = await service.createExpense(req.body as CreateExpenseInput, req.user!, req.ip);
  res.status(201).json({ data: { expense } });
};

export const list: RequestHandler = async (req, res) => {
  const query = parseInput(dateRangeSchema, req.query);
  res.json({ data: { expenses: await service.listExpenses(query) } });
};
