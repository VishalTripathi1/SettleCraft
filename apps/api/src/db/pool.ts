import pg from 'pg';
import { env } from '../config/env.js';
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 15,
  connectionTimeoutMillis: 3000,
  statement_timeout: 10000,
});
export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
