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

test('POST /api/session/new returns a session_id (UUID)', async () => {
  const app = await build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/session/new',
    headers: { origin: 'https://demo.example', 'content-type': 'application/json' },
    payload: { tenant_id: 'demo-bank' },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(typeof body.session_id === 'string');
  assert.match(body.session_id, /^[0-9a-f-]{36}$/);
  await app.close();
});

test('session row is persisted with tenant_id and default lang', async () => {
  const app = await build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/session/new',
    headers: { origin: 'https://demo.example', 'content-type': 'application/json' },
    payload: { tenant_id: 'demo-bank' },
  });
  const body = res.json();
  const { rows } = await pool.query<{ tenant_id: string; lang: string }>(
    `SELECT tenant_id, lang FROM sessions WHERE id=$1`, [body.session_id]
  );
  assert.equal(rows[0]?.tenant_id, 'demo-bank');
  assert.equal(rows[0]?.lang, 'ru');
  await app.close();
});

test('user_meta is stored when provided', async () => {
  const app = await build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/session/new',
    headers: { origin: 'https://demo.example', 'content-type': 'application/json' },
    payload: { tenant_id: 'demo-bank', user_meta: { user_id: 'u1', tier: 'gold' } },
  });
  const body = res.json();
  const { rows } = await pool.query<{ user_meta: Record<string, unknown> }>(
    `SELECT user_meta FROM sessions WHERE id=$1`, [body.session_id]
  );
  assert.equal(rows[0]?.user_meta.user_id, 'u1');
  assert.equal(rows[0]?.user_meta.tier, 'gold');
  await app.close();
});

test('returns 404 for unknown tenant', async () => {
  const app = await build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/session/new',
    headers: { origin: 'https://demo.example', 'content-type': 'application/json' },
    payload: { tenant_id: 'nonexistent' },
  });
  assert.equal(res.statusCode, 404);
  await app.close();
});
