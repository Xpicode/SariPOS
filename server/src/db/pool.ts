import { Pool, types, type PoolClient } from 'pg';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// BIGINT (ids, centavos) arrives as a string by default, and 0 + "1250" = "01250".
// Number is exact up to 2^53 (about ₱90 trillion in centavos), far beyond any store.
// Note: SUM() of a BIGINT returns NUMERIC, which stays a string; cast it with ::bigint in reports.
types.setTypeParser(types.builtins.INT8, Number);

export const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });

// Repositories accept either: the pool (single query) or a client inside withTransaction().
export type Db = Pool | PoolClient;

// An idle connection can drop (DB restart, network blip). Without this listener Node crashes the API.
pool.on('error', (err) => logger.error(err, 'Idle PostgreSQL client error'));
