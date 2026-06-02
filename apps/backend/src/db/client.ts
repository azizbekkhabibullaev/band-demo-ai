import { Pool, type PoolConfig } from 'pg';

function buildConfig(): PoolConfig {
  const url = process.env.DATABASE_URL ?? 'postgres://chatbot:chatbot@localhost:5433/chatbot';
  return { connectionString: url, max: 10, idleTimeoutMillis: 30_000 };
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) pool = new Pool(buildConfig());
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
