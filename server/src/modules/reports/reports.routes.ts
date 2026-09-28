import { Router, type RequestHandler } from 'express';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { parseInput } from '../../middleware/validate';
import { dateRangeSchema, type DateRange } from '../../utils/dateRange';
import { auditQuerySchema } from './reports.schema';
import * as service from './reports.service';

// ?from=YYYY-MM-DD&to=YYYY-MM-DD (store days, at most ~3 months) for every date-range report.
const ranged =
  (fn: (q: DateRange) => Promise<unknown>): RequestHandler =>
  async (req, res) => {
    res.json({ data: await fn(parseInput(dateRangeSchema, req.query)) });
  };

// Reports are the OWNER's, all of them: profit, costs and the audit trail are business secrets
// (plan: "Cashier cannot open any report"). One line guards the whole router, so a report added
// later can't forget it.
export const reportsRouter = Router();
reportsRouter.use(auth, requireRole('OWNER'));
reportsRouter.get('/dashboard', async (_req, res) => {
  res.json({ data: await service.dashboard() });
});
reportsRouter.get('/profit', ranged(service.profit));
reportsRouter.get('/product-sales', ranged(service.productSales));
reportsRouter.get('/sales-trend', ranged(service.salesTrend));
reportsRouter.get('/peak-hours', ranged(service.peakHours));
reportsRouter.get('/audit-log', async (req, res) => {
  res.json({ data: await service.auditLog(parseInput(auditQuerySchema, req.query)) });
});
