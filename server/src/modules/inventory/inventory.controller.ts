import type { RequestHandler } from 'express';
import { parseInput } from '../../middleware/validate';
import {
  expiringQuerySchema,
  movementsQuerySchema,
  type AdjustInput,
  type StockInInput,
} from './inventory.schema';
import * as service from './inventory.service';

export const stockIn: RequestHandler = async (req, res) => {
  res.status(201).json({ data: await service.stockIn(req.body as StockInInput, req.user!.id) });
};

export const adjust: RequestHandler = async (req, res) => {
  res
    .status(201)
    .json({ data: await service.adjustStock(req.body as AdjustInput, req.user!.id, req.ip) });
};

export const movements: RequestHandler = async (req, res) => {
  const { productId } = parseInput(movementsQuerySchema, req.query);
  res.json({ data: { movements: await service.listMovements(productId) } });
};

export const expiring: RequestHandler = async (req, res) => {
  const { days } = parseInput(expiringQuerySchema, req.query);
  res.json({ data: { items: await service.listExpiring(days) } });
};
