import './testEnv'; // must stay the first import
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { app } from '../app';
import { pool } from '../db/pool';

// Brings the test database to a known state: latest migrations, then the dev seed
// (which empties every table first). Run once per test file, in before().
export function resetDb() {
  for (const args of [
    ['node_modules/node-pg-migrate/bin/node-pg-migrate.js', 'up'],
    ['--import', 'tsx', 'seeds/seed.ts'],
  ]) {
    const r = spawnSync(process.execPath, args, { env: process.env, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${args.at(-1)} failed:\n${r.stderr || r.stdout}`);
  }
}

type Options = { token?: string; body?: unknown; headers?: Record<string, string> };

// The real app on a random free port, called over real HTTP (no mocks): what a browser gets.
export async function startApi() {
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

  async function call(method: string, path: string, opts: Options = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(opts.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test code reads any field
    const body: any = text ? JSON.parse(text) : null;
    return { status: res.status, body, headers: res.headers };
  }

  async function login(username: string, password: string) {
    const r = await call('POST', '/auth/login', { body: { username, password } });
    if (r.status !== 200)
      throw new Error(`login ${username}: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.data.accessToken as string;
  }

  async function close() {
    server.close();
    await pool.end();
  }

  return { base, call, login, close };
}

export const passwords = () => ({
  owner: process.env.SEED_OWNER_PASSWORD!,
  cashier: process.env.SEED_CASHIER_PASSWORD!,
  pin: process.env.SEED_OWNER_PIN!,
});

// Seed rows the tests need, looked up by name so they don't depend on id order.
export async function unitId(product: string, unit: string) {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT u.id FROM product_units u JOIN products p ON p.id = u.product_id
     WHERE p.name = $1 AND u.unit_name = $2`,
    [product, unit],
  );
  if (!rows[0]) throw new Error(`No ${unit} of ${product} in the seed`);
  return rows[0].id;
}

export async function stockOf(product: string) {
  const { rows } = await pool.query<{ stock_qty: number }>(
    'SELECT stock_qty FROM products WHERE name = $1',
    [product],
  );
  return rows[0].stock_qty;
}

export async function customerId(name: string) {
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM customers WHERE name = $1', [
    name,
  ]);
  return rows[0].id;
}
