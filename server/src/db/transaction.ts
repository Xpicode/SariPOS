import type { PoolClient } from 'pg';
import { pool } from './pool';

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // Undo everything if any step fails. If even ROLLBACK fails, the connection is dead.
    await client.query('ROLLBACK').catch((rollbackErr: Error) => {
      broken = rollbackErr;
    });
    throw err; // the original error is the one worth reporting
  } finally {
    client.release(broken); // an error here destroys the connection instead of reusing it
  }
}
