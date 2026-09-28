import type { RequestHandler } from 'express';
import { parseId, parseInput } from '../../middleware/validate';
import {
  barcodeSchema,
  listQuerySchema,
  type CreateProductInput,
  type UpdateProductInput,
} from './products.schema';
import * as service from './products.service';

export const list: RequestHandler = async (req, res) => {
  const query = parseInput(listQuerySchema, req.query);
  res.json({ data: { products: await service.listProducts(query, req.user!) } });
};

export const get: RequestHandler = async (req, res) => {
  res.json({ data: { product: await service.getProduct(parseId(req.params.id), req.user!) } });
};

export const byBarcode: RequestHandler = async (req, res) => {
  const code = parseInput(barcodeSchema, req.params.code);
  res.json({ data: await service.getByBarcode(code, req.user!) });
};

export const create: RequestHandler = async (req, res) => {
  const product = await service.createProduct(req.body as CreateProductInput, req.user!, req.ip);
  res.status(201).json({ data: { product } });
};

export const update: RequestHandler = async (req, res) => {
  const id = parseId(req.params.id);
  const product = await service.updateProduct(
    id,
    req.body as UpdateProductInput,
    req.user!,
    req.ip,
  );
  res.json({ data: { product } });
};

export const listCategories: RequestHandler = async (_req, res) => {
  res.json({ data: { categories: await service.listCategories() } });
};

export const createCategory: RequestHandler = async (req, res) => {
  const category = await service.createCategory((req.body as { name: string }).name);
  res.status(201).json({ data: { category } });
};
