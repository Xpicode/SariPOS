import type { RequestHandler } from 'express';
import { parseId, parseInput } from '../../middleware/validate';
import { dateRangeSchema } from '../../utils/dateRange';
import type { CreateSaleInput, VoidSaleInput } from './sales.schema';
import * as service from './sales.service';

export const create: RequestHandler = async (req, res) => {
  const { sale, replayed } = await service.createSale(req.body as CreateSaleInput, req.user!.id);
  // 201 = a new sale was saved. 200 = "you already sent this one; here it is again".
  res.status(replayed ? 200 : 201).json({ data: { sale, replayed } });
};

export const list: RequestHandler = async (req, res) => {
  const query = parseInput(dateRangeSchema, req.query);
  res.json({ data: { sales: await service.listSales(query, req.user!) } });
};

export const get: RequestHandler = async (req, res) => {
  res.json({ data: { sale: await service.getSale(parseId(req.params.id), req.user!) } });
};

export const voidSale: RequestHandler = async (req, res) => {
  const sale = await service.voidSale(
    parseId(req.params.id),
    req.body as VoidSaleInput,
    req.user!,
    req.ip,
  );
  res.json({ data: { sale } });
};
