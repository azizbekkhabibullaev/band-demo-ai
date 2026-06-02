import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { getPool, closePool } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { clearTenantCache } from '../../src/tenants/resolver.js';
import { build } from '../../src/server.js';
import { resetRateLimits, checkSessionRateLimit, resetSessionRateLimits } from '../../src/middleware/rate-limit.js';

const pool = getPool();
const DB_TEST_LOCK_KEY = 91823746;
let lockClient: PoolClient | null = null;

before(async () => {
  lockClient = await pool.connect();
  await lockClient.query('SELECT pg_advisory_lock($1)', [DB_TEST_LOCK_KEY]);
  await runMigrations();
  await pool.query(`DELETE FROM tenants WHERE id='demo-bank'`);
  await pool.query(`INSERT INTO tenants (id, name, allowed_origins, config)
                    VALUES ('demo-bank', 'Demo', ARRAY['https://demo.example'], $1::jsonb)`,
                    [JSON.stringify({
                      limits: { ratePerMinPerIp: 3, messagesPerSessionPer10Min: 30, maxMessageLength: 2000, monthlyLlmBudgetUsd: 50 }
                    })]);
  clearTenantCache();
});

after(async () => {
  if (lockClient) {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [DB_TEST_LOCK_KEY]);
    lockClient.release();
  }
  await closePool();
});

test('requests within limit succeed', async () => {
  resetRateLimits();
  const app = await build();
  app.get<{ Params: { tenant: string } }>('/api/__rl/:tenant', async () => ({ ok: true }));
  for (let i = 0; i < 3; i++) {
    const res = await app.inject({
      method: 'GET',
      url: '/api/__rl/demo-bank',
      headers: { origin: 'https://demo.example', 'x-forwarded-for': '10.0.0.1' },
    });
    assert.notEqual(res.statusCode, 429, `request ${i + 1} should not be rate-limited`);
  }
  await app.close();
});

test('exceeding the per-minute limit returns 429 with Retry-After', async () => {
  resetRateLimits();
  const app = await build();
  app.get<{ Params: { tenant: string } }>('/api/__rl/:tenant', async () => ({ ok: true }));
  // 3 allowed, 4th should fail
  for (let i = 0; i < 3; i++) {
    await app.inject({
      method: 'GET',
      url: '/api/__rl/demo-bank',
      headers: { origin: 'https://demo.example', 'x-forwarded-for': '10.0.0.2' },
    });
  }
  const blocked = await app.inject({
    method: 'GET',
    url: '/api/__rl/demo-bank',
    headers: { origin: 'https://demo.example', 'x-forwarded-for': '10.0.0.2' },
  });
  assert.equal(blocked.statusCode, 429);
  assert.ok(blocked.headers['retry-after'], 'expected Retry-After header');
  await app.close();
});

test('different IPs have independent buckets', async () => {
  resetRateLimits();
  const app = await build();
  app.get<{ Params: { tenant: string } }>('/api/__rl/:tenant', async () => ({ ok: true }));
  for (let i = 0; i < 3; i++) {
    await app.inject({
      method: 'GET',
      url: '/api/__rl/demo-bank',
      headers: { origin: 'https://demo.example', 'x-forwarded-for': '10.0.0.3' },
    });
  }
  const fresh = await app.inject({
    method: 'GET',
    url: '/api/__rl/demo-bank',
    headers: { origin: 'https://demo.example', 'x-forwarded-for': '10.0.0.4' },
  });
  assert.notEqual(fresh.statusCode, 429);
  await app.close();
});

test('checkSessionRateLimit allows messages up to the limit', () => {
  resetSessionRateLimits();
  assert.equal(checkSessionRateLimit('sess-1', 3), true);
  assert.equal(checkSessionRateLimit('sess-1', 3), true);
  assert.equal(checkSessionRateLimit('sess-1', 3), true);
  assert.equal(checkSessionRateLimit('sess-1', 3), false); // 4th exceeds limit of 3
});

test('checkSessionRateLimit is independent per session', () => {
  resetSessionRateLimits();
  assert.equal(checkSessionRateLimit('sess-a', 2), true);
  assert.equal(checkSessionRateLimit('sess-a', 2), true);
  assert.equal(checkSessionRateLimit('sess-a', 2), false);
  assert.equal(checkSessionRateLimit('sess-b', 2), true); // different session unaffected
});
