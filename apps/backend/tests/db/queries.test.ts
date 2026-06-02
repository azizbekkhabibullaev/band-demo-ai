import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { getPool, closePool } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { clearTenantCache } from '../../src/tenants/resolver.js';
import { getSessionWithHistory, insertMessage } from '../../src/db/queries.js';

const pool = getPool();
const DB_TEST_LOCK_KEY = 91823746;
let lockClient: PoolClient | null = null;
let sessionId: string;

const TENANT_CONFIG = {
  hotline: '1200',
  branding: { displayName: 'Demo Bank', logoUrl: null, accentColor: '#0a0' },
  languages: { default: 'ru', enabled: ['uz', 'ru', 'en'] },
  model: { chat: 'gpt-4o-mini', embedding: 'text-embedding-3-small' },
  limits: {
    ratePerMinPerIp: 60,
    messagesPerSessionPer10Min: 30,
    maxMessageLength: 2000,
    monthlyLlmBudgetUsd: 50,
  },
  greeting: { uz: 'Salom', ru: 'Здравствуйте', en: 'Hi' },
};

before(async () => {
  lockClient = await pool.connect();
  await lockClient.query('SELECT pg_advisory_lock($1)', [DB_TEST_LOCK_KEY]);
  await runMigrations();
  await pool.query(`DELETE FROM tenants WHERE id='demo-bank'`);
  await pool.query(
    `INSERT INTO tenants (id, name, allowed_origins, config)
     VALUES ('demo-bank','Demo Bank',ARRAY['https://demo.example'],$1::jsonb)`,
    [JSON.stringify(TENANT_CONFIG)],
  );
  clearTenantCache();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO sessions (tenant_id, lang, user_meta)
     VALUES ('demo-bank','ru','{}'::jsonb) RETURNING id`,
  );
  sessionId = rows[0]!.id;
});

after(async () => {
  if (lockClient) {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [DB_TEST_LOCK_KEY]);
    lockClient.release();
    lockClient = null;
  }
  await closePool();
});

test('getSessionWithHistory returns session with no messages initially', async () => {
  const result = await getSessionWithHistory(sessionId, 'demo-bank');
  assert.notEqual(result, null);
  assert.equal(result!.session.tenant_id, 'demo-bank');
  assert.equal(result!.session.lang, 'ru');
  assert.deepEqual(result!.messages, []);
});

test('getSessionWithHistory returns null when tenant_id does not match', async () => {
  const result = await getSessionWithHistory(sessionId, 'other-bank');
  assert.equal(result, null);
});

test('getSessionWithHistory returns null for unknown session_id', async () => {
  const result = await getSessionWithHistory(
    '00000000-0000-0000-0000-000000000000',
    'demo-bank',
  );
  assert.equal(result, null);
});

test('insertMessage persists a user message', async () => {
  const { id } = await insertMessage({
    sessionId,
    tenantId: 'demo-bank',
    role: 'user',
    content: 'How do I open an account?',
    lang: 'ru',
  });
  assert.ok(typeof id === 'string' && id.length > 0);

  const { rows } = await pool.query<{ role: string; content: string }>(
    `SELECT role, content FROM messages WHERE id=$1`,
    [id],
  );
  assert.equal(rows[0]?.role, 'user');
  assert.equal(rows[0]?.content, 'How do I open an account?');
});

test('insertMessage persists an assistant message with metadata', async () => {
  const { id } = await insertMessage({
    sessionId,
    tenantId: 'demo-bank',
    role: 'assistant',
    content: 'To open an account, visit any branch.',
    lang: 'ru',
    retrievedChunkIds: [],
    retrievalScores: [],
    promptTokens: 120,
    completionTokens: 40,
    latencyMs: 1800,
    model: 'gpt-4o-mini',
    escalationSignaled: false,
  });

  const { rows } = await pool.query<{
    prompt_tokens: number;
    completion_tokens: number;
    model: string;
    escalation_signaled: boolean;
  }>(
    `SELECT prompt_tokens, completion_tokens, model, escalation_signaled
       FROM messages WHERE id=$1`,
    [id],
  );
  assert.equal(rows[0]?.prompt_tokens, 120);
  assert.equal(rows[0]?.completion_tokens, 40);
  assert.equal(rows[0]?.model, 'gpt-4o-mini');
  assert.equal(rows[0]?.escalation_signaled, false);
});

test('getSessionWithHistory returns messages in chronological order', async () => {
  // Use a fresh session to avoid relying on state from other tests
  const { rows: newSession } = await pool.query<{ id: string }>(
    `INSERT INTO sessions (tenant_id, lang, user_meta)
     VALUES ('demo-bank','ru','{}'::jsonb) RETURNING id`,
  );
  const newSessionId = newSession[0]!.id;

  await insertMessage({ sessionId: newSessionId, tenantId: 'demo-bank', role: 'user', content: 'Q1', lang: 'ru' });
  await insertMessage({ sessionId: newSessionId, tenantId: 'demo-bank', role: 'assistant', content: 'A1', lang: 'ru' });
  await insertMessage({ sessionId: newSessionId, tenantId: 'demo-bank', role: 'user', content: 'Q2', lang: 'ru' });
  await insertMessage({ sessionId: newSessionId, tenantId: 'demo-bank', role: 'assistant', content: 'A2', lang: 'ru' });

  const result = await getSessionWithHistory(newSessionId, 'demo-bank');
  assert.ok(result !== null);
  assert.equal(result!.messages.length, 4);
  assert.equal(result!.messages[0]!.content, 'Q1');
  assert.equal(result!.messages[1]!.content, 'A1');
  assert.equal(result!.messages[2]!.content, 'Q2');
  assert.equal(result!.messages[3]!.content, 'A2');
});
