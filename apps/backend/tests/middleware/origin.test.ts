import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { getPool, closePool } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { clearTenantCache } from '../../src/tenants/resolver.js';
import { build } from '../../src/server.js';

const pool = getPool();
const DB_TEST_LOCK_KEY = 91823746;
let lockClient: PoolClient | null = null;

before(async () => {
  lockClient = await pool.connect();
  await lockClient.query('SELECT pg_advisory_lock($1)', [DB_TEST_LOCK_KEY]);
  await runMigrations();
  await pool.query(`DELETE FROM tenants WHERE id='demo-bank'`);
  await pool.query(`INSERT INTO tenants (id, name, allowed_origins, config)
                    VALUES ('demo-bank', 'Demo', ARRAY['https://demo.example'], '{}'::jsonb)`);
  clearTenantCache();
});

after(async () => {
  if (lockClient) {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [DB_TEST_LOCK_KEY]);
    lockClient.release();
  }
  await closePool();
});

test('request with no tenant_id passes through (health route still works)', async () => {
  const app = await build();
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test('GET with :tenant param + allowed origin populates req.tenant and sets CORS header', async () => {
  const app = await build();
  // Register a stub route mirroring T8 to exercise the param path.
  app.get<{ Params: { tenant: string } }>('/api/__test/:tenant', async (req) => {
    return { tenantId: req.tenant?.id ?? null };
  });
  const res = await app.inject({
    method: 'GET',
    url: '/api/__test/demo-bank',
    headers: { origin: 'https://demo.example' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], 'https://demo.example');
  assert.equal(res.json().tenantId, 'demo-bank');
  await app.close();
});

test('POST with body tenant_id + allowed origin populates req.tenant', async () => {
  const app = await build();
  app.post('/api/__test/post', async (req) => {
    return { tenantId: req.tenant?.id ?? null };
  });
  const res = await app.inject({
    method: 'POST',
    url: '/api/__test/post',
    headers: { origin: 'https://demo.example', 'content-type': 'application/json' },
    payload: { tenant_id: 'demo-bank' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], 'https://demo.example');
  assert.equal(res.json().tenantId, 'demo-bank');
  await app.close();
});

test('valid tenant + disallowed origin returns 404 (no CORS header)', async () => {
  const app = await build();
  app.get<{ Params: { tenant: string } }>('/api/__test/:tenant', async () => ({ ok: true }));
  const res = await app.inject({
    method: 'GET',
    url: '/api/__test/demo-bank',
    headers: { origin: 'https://attacker.example' },
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  await app.close();
});

test('unknown tenant returns 404', async () => {
  const app = await build();
  app.get<{ Params: { tenant: string } }>('/api/__test/:tenant', async () => ({ ok: true }));
  const res = await app.inject({
    method: 'GET',
    url: '/api/__test/nonexistent',
    headers: { origin: 'https://demo.example' },
  });
  assert.equal(res.statusCode, 404);
  await app.close();
});

test('OPTIONS preflight returns 204 with CORS headers for any origin', async () => {
  const app = await build();
  const res = await app.inject({
    method: 'OPTIONS',
    url: '/api/session/new',
    headers: {
      origin: 'https://demo.example',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'https://demo.example');
  await app.close();
});
