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
                    VALUES ('demo-bank', 'Demo Bank', ARRAY['https://demo.example'], $1::jsonb)`,
                    [JSON.stringify({
                      hotline: '1200',
                      branding: { displayName: 'Demo', logoUrl: null, accentColor: '#0a0' },
                      languages: { default: 'ru', enabled: ['uz','ru','en'] },
                      model: { chat: 'gpt-4o-mini', embedding: 'text-embedding-3-small' },
                      limits: { ratePerMinPerIp: 60, messagesPerSessionPer10Min: 30, maxMessageLength: 2000, monthlyLlmBudgetUsd: 50 },
                      greeting: { uz: 'Salom', ru: 'Здр', en: 'Hi' },
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

test('GET /api/widget-config returns branding for valid tenant', async () => {
  const app = await build();
  const res = await app.inject({
    method: 'GET',
    url: '/api/widget-config/demo-bank',
    headers: { origin: 'https://demo.example' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.tenant_id, 'demo-bank');
  assert.equal(body.name, 'Demo Bank');
  assert.equal(body.branding.displayName, 'Demo');
  assert.equal(body.branding.accentColor, '#0a0');
  assert.deepEqual(body.languages.enabled, ['uz','ru','en']);
  assert.equal(body.hotline, '1200');
  assert.equal(body.greeting.uz, 'Salom');
  await app.close();
});

test('returns 404 for unknown tenant', async () => {
  const app = await build();
  const res = await app.inject({
    method: 'GET',
    url: '/api/widget-config/nonexistent',
    headers: { origin: 'https://demo.example' },
  });
  assert.equal(res.statusCode, 404);
  await app.close();
});
