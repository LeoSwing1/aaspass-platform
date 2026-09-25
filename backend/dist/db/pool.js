import pg from 'pg';
import { env } from '../config/env.js';
const { Pool } = pg;
if (!env.DATABASE_URL)
    throw new Error('DATABASE_URL is not configured');
export const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ...(env.DATABASE_SSL ? { ssl: { rejectUnauthorized: false } } : {}),
    max: 15, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000
});
export async function query(text, values = []) {
    if (!pool)
        throw new Error('DATABASE_URL is not configured');
    return pool.query(text, values);
}
