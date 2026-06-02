import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { resolveTenant, clearTenantCache } from '../../src/tenants/resolver.js';

const pool = getPool();

// Shared advisory lock key (matches migrate.test.ts) to serialize DB-mutating
// test files. Node's --test runner runs files in parallel child processes;
// without serialization, concurrent schema reset / migration runs race.
const DB_TEST_LOCK_KEY = 91823746;
let lockClient: import('pg').PoolClient | null = null;

before(async () => {
  lockClient = await pool.connect();
  await lockClient.query('SELECT pg_advisory_lock($1)', [DB_TEST_LOCK_KEY]);
  // Ensure schema exists (idempotent). We avoid DROP SCHEMA here so this test
  // doesn't tear down the migrate.test fixture if it runs after; instead we
  // scope cleanup to the tenants table, which is all this test touches.
  await runMigrations();
  await pool.query(
    `DELETE FROM tenants WHERE id IN ('demo-bank','disabled-bank','nonexistent')`,
  );
  await pool.query(
    `
    INSERT INTO tenants (id, name, allowed_origins, config) VALUES
    ('demo-bank', 'Demo Bank', ARRAY['https://demo.example'], $1::jsonb),
    ('disabled-bank', 'Disabled Bank', ARRAY['https://x.example'], $1::jsonb)
  `,
    [
      JSON.stringify({
        hotline: '1200',
        branding: { displayName: 'Demo', logoUrl: null, accentColor: '#0a0' },
        languages: { default: 'ru', enabled: ['uz', 'ru', 'en'] },
        model: { chat: 'gpt-4o-mini', embedding: 'text-embedding-3-small' },
        limits: {
          ratePerMinPerIp: 60,
          messagesPerSessionPer10Min: 30,
          maxMessageLength: 2000,
          monthlyLlmBudgetUsd: 50,
        },
        greeting: { uz: 'Salom', ru: 'Здравствуйте', en: 'Hi' },
      }),
    ],
  );
  await pool.query(`UPDATE tenants SET status='disabled' WHERE id='disabled-bank'`);
  clearTenantCache();
});

after(async () => {
  if (lockClient) {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [DB_TEST_LOCK_KEY]);
    lockClient.release();
    lockClient = null;
  }
  await closePool();
});

test('resolveTenant returns null for unknown tenant', async () => {
  assert.equal(await resolveTenant('nonexistent'), null);
});

test('resolveTenant returns null for disabled tenant', async () => {
  assert.equal(await resolveTenant('disabled-bank'), null);
});

test('resolveTenant returns parsed Tenant for active tenant', async () => {
  const t = await resolveTenant('demo-bank');
  assert.ok(t, 'expected tenant');
  assert.equal(t!.id, 'demo-bank');
  assert.equal(t!.name, 'Demo Bank');
  assert.equal(t!.status, 'active');
  assert.deepEqual(t!.allowedOrigins, ['https://demo.example']);
  assert.equal(t!.config.hotline, '1200');
  assert.equal(t!.config.branding.accentColor, '#0a0');
});

test('resolveTenant uses memo cache on subsequent calls (verify by row delete)', async () => {
  await resolveTenant('demo-bank');
  await pool.query(`DELETE FROM tenants WHERE id='demo-bank'`);
  const stillCached = await resolveTenant('demo-bank');
  assert.ok(stillCached !== null, 'expected cached value despite DB deletion');
  clearTenantCache();
  assert.equal(await resolveTenant('demo-bank'), null);
});
