import pg from 'pg';
import { env } from '../config/env.js';
const { Pool } = pg;
export const pool = env.DATABASE_URL ? new Pool({
  connectionString: env.DATABASE_URL,
  ...(env.DATABASE_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 15, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000
}) : null;
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text:string, values:unknown[]=[]): Promise<pg.QueryResult<T>> {
  if (!pool) throw new Error('DATABASE_URL is not configured');
  return pool.query<T>(text, values);
}
