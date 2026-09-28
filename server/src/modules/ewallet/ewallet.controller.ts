import type { RequestHandler } from 'express';
import { parseId, parseInput } from '../../middleware/validate';
import { dateRangeSchema } from '../../utils/dateRange';
import type {
  FeePreviewInput,
  FeeRulesInput,
  TransactionInput,
  UpdateAccountInput,
} from './ewallet.schema';
import * as service from './ewallet.service';

export const accounts: RequestHandler = async (_req, res) => {
  res.json({ data: { accounts: await service.listWallets() } });
};

export const updateAccount: RequestHandler = async (req, res) => {
  const account = await service.updateWallet(
    parseId(req.params.id),
    req.body as UpdateAccountInput,
    req.user!.id,
    req.ip,
  );
  res.json({ data: { account } });
};

export const feePreview: RequestHandler = async (req, res) => {
  res.json({ data: await service.previewFee(req.body as FeePreviewInput) });
};

export const createTransaction: RequestHandler = async (req, res) => {
  const result = await service.createTransaction(req.body as TransactionInput, req.user!, req.ip);
  res.status(result.replayed ? 200 : 201).json({ data: result });
};

export const listTransactions: RequestHandler = async (req, res) => {
  const query = parseInput(dateRangeSchema, req.query);
  res.json({ data: { transactions: await service.listTransactions(query, req.user!) } });
};

export const feeRules: RequestHandler = async (_req, res) => {
  res.json({ data: { rules: await service.listFeeRules() } });
};

export const saveFeeRules: RequestHandler = async (req, res) => {
  const rules = await service.saveFeeRules(req.body as FeeRulesInput, req.user!.id, req.ip);
  res.json({ data: { rules } });
};
