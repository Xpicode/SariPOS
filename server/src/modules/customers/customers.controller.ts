import type { RequestHandler } from 'express';
import { parseId, parseInput } from '../../middleware/validate';
import {
  listCustomersQuerySchema,
  type CreateCustomerInput,
  type PaymentInput,
  type UpdateCustomerInput,
} from './customers.schema';
import * as service from './customers.service';

export const list: RequestHandler = async (req, res) => {
  const { search } = parseInput(listCustomersQuerySchema, req.query);
  res.json({ data: { customers: await service.listCustomers(search, req.user!.role) } });
};

export const create: RequestHandler = async (req, res) => {
  const customer = await service.createCustomer(req.body as CreateCustomerInput, req.user!, req.ip);
  res.status(201).json({ data: { customer } });
};

export const update: RequestHandler = async (req, res) => {
  const customer = await service.updateCustomer(
    parseId(req.params.id),
    req.body as UpdateCustomerInput,
    req.user!,
    req.ip,
  );
  res.json({ data: { customer } });
};

export const addInterest: RequestHandler = async (req, res) => {
  const customer = await service.addInterest(parseId(req.params.id), req.user!, req.ip);
  res.status(201).json({ data: { customer } });
};

export const ledger: RequestHandler = async (req, res) => {
  res.json({ data: await service.getStatement(parseId(req.params.id), req.user!.role) });
};

export const pay: RequestHandler = async (req, res) => {
  const result = await service.receivePayment(
    parseId(req.params.id),
    req.body as PaymentInput,
    req.user!,
  );
  res.status(result.replayed ? 200 : 201).json({ data: result });
};

export const aging: RequestHandler = async (_req, res) => {
  res.json({ data: await service.agingReport() });
};
