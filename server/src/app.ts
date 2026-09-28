import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { pool } from './db/pool';
import { errorHandler, notFound } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { cashSessionsRouter } from './modules/cash-sessions/cash-sessions.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { ewalletRouter } from './modules/ewallet/ewallet.routes';
import { expensesRouter } from './modules/expenses/expenses.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { categoriesRouter, productsRouter } from './modules/products/products.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { salesRouter } from './modules/sales/sales.routes';
import { usersRouter } from './modules/users/users.routes';

export const app = express();

app.disable('x-powered-by'); // don't advertise "Express" to attackers
app.use(helmet()); // secure HTTP headers
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true })); // only our frontend, with cookies
app.use(express.json({ limit: '100kb' })); // reject huge bodies
app.use(cookieParser()); // fills req.cookies (the refresh token)

app.get('/api/v1/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', db: 'ok' });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/categories', categoriesRouter);
app.use('/api/v1/inventory', inventoryRouter);
app.use('/api/v1/cash-sessions', cashSessionsRouter);
app.use('/api/v1/sales', salesRouter);
app.use('/api/v1/expenses', expensesRouter);
app.use('/api/v1/customers', customersRouter);
app.use('/api/v1/ewallet', ewalletRouter);
app.use('/api/v1/reports', reportsRouter);

app.use(notFound);
app.use(errorHandler);
