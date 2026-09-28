import type { RequestHandler } from 'express';
import { parseId, parseInput } from '../../middleware/validate';
import { dateRangeSchema } from '../../utils/dateRange';
import type { CloseSessionInput, OpenSessionInput } from './cash-sessions.schema';
import * as service from './cash-sessions.service';

export const current: RequestHandler = async (req, res) => {
  res.json({ data: { session: await service.getCurrent(req.user!.role) } }); // null = drawer closed
};

export const open: RequestHandler = async (req, res) => {
  const { openingCash } = req.body as OpenSessionInput;
  const session = await service.openSession(openingCash, req.user!.id, req.user!.role, req.ip);
  res.status(201).json({ data: { session } });
};

export const close: RequestHandler = async (req, res) => {
  const session = await service.closeSession(
    parseId(req.params.id),
    req.body as CloseSessionInput,
    req.user!.id,
    req.ip,
  );
  res.json({ data: { session } });
};

export const list: RequestHandler = async (req, res) => {
  const query = parseInput(dateRangeSchema, req.query);
  res.json({ data: { sessions: await service.listSessions(query) } });
};

export const report: RequestHandler = async (req, res) => {
  res.json({ data: { session: await service.getReport(parseId(req.params.id)) } });
};
