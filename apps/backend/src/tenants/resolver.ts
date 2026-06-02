import { getPool } from '../db/client.js';
import type { Tenant, TenantConfig } from './types.js';

interface CacheEntry {
  tenant: Tenant | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export function clearTenantCache(): void {
  cache.clear();
}

interface TenantRow {
  id: string;
  name: string;
  status: 'active' | 'disabled';
  allowed_origins: string[];
  config: TenantConfig;
}

export async function resolveTenant(id: string): Promise<Tenant | null> {
  const now = Date.now();
  const cached = cache.get(id);
  if (cached && cached.expiresAt > now) return cached.tenant;

  const pool = getPool();
  const result = await pool.query<TenantRow>(
    `SELECT id, name, status, allowed_origins, config
       FROM tenants
      WHERE id = $1 AND status = 'active'`,
    [id]
  );

  const tenant: Tenant | null = result.rows[0]
    ? {
        id: result.rows[0].id,
        name: result.rows[0].name,
        status: result.rows[0].status,
        allowedOrigins: result.rows[0].allowed_origins,
        config: result.rows[0].config,
      }
    : null;

  cache.set(id, { tenant, expiresAt: now + CACHE_TTL_MS });
  return tenant;
}
