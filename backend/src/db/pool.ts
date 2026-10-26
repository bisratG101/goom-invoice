import { Pool } from 'pg';
import { env } from '../config/env';

let pool: Pool | null = null;

export function getDbPool(): Pool | null {
  if (!env.DATABASE_URL) {
    return null;
  }
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function checkDbHealth(): Promise<{ configured: boolean; connected: boolean }> {
  const activePool = getDbPool();
  if (!activePool) {
    return { configured: false, connected: false };
  }
  try {
    const client = await activePool.connect();
    try {
      await client.query('SELECT 1');
      return { configured: true, connected: true };
    } finally {
      client.release();
    }
  } catch {
    return { configured: true, connected: false };
  }
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
