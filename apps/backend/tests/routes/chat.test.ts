import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { getPool, closePool } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { clearTenantCache } from '../../src/tenants/resolver.js';
import { resetRateLimits, resetSessionRateLimits, checkSessionRateLimit } from '../../src/middleware/rate-limit.js';
import { build } from '../../src/server.js';

const pool = getPool();
const DB_TEST_LOCK_KEY = 91823746;
let lockClient: PoolClient | null = null;
let sessionId: string;
const originalFetch = globalThis.fetch;

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

function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function mockOpenAi(): void {
  process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = async (url: string | URL | Request) => {
    const s = String(url instanceof Request ? url.url : url);
    if (s.includes('/embeddings')) {
      return new Response(
        JSON.stringify({ data: [{ embedding: Array(1536).fill(0.1) }] }),
        { status: 200 },
      );
    }
    if (s.includes('/chat/completions')) {
      return new Response(
        makeSseStream([
          'data: {"id":"1","choices":[{"delta":{"content":"Чтобы открыть счёт"}}]}\n\n',
          'data: {"id":"1","choices":[{"delta":{"content":", посетите отделение."}}]}\n\n',
          'data: {"id":"1","choices":[{"delta":{}}],"usage":{"prompt_tokens":20,"completion_tokens":10}}\n\n',
          'data: [DONE]\n\n',
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    }
    throw new Error(`Unexpected fetch: ${s}`);
  };
}

function parseSseEvents(body: string): Record<string, unknown>[] {
  return body
    .split('\n\n')
    .filter(b => b.startsWith('data: '))
    .map(b => {
      try { return JSON.parse(b.slice(6)) as Record<string, unknown>; }
      catch { return null; }
    })
    .filter((e): e is Record<string, unknown> => e !== null);
}

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
  globalThis.fetch = originalFetch;
  delete process.env.OPENAI_API_KEY;
  if (lockClient) {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [DB_TEST_LOCK_KEY]);
    lockClient.release();
    lockClient = null;
  }
  await closePool();
});

test('POST /api/chat streams SSE delta and done events', async () => {
  mockOpenAi();
  resetRateLimits();
  resetSessionRateLimits();

  const app = await build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/chat',
    headers: { origin: 'https://demo.example', 'content-type': 'application/json' },
    payload: { tenant_id: 'demo-bank', session_id: sessionId, message: 'How do I open an account?' },
  });
  await app.close();

  assert.equal(res.statusCode, 200);
  assert.ok(String(res.headers['content-type'] ?? '').includes('text/event-stream'));

  const events = parseSseEvents(res.payload);
  const deltas = events.filter(e => e['type'] === 'delta');
  const done = events.find(e => e['type'] === 'done') as Record<string, unknown> | undefined;

  assert.ok(deltas.length > 0, 'should have at least one delta event');
  assert.ok(done, 'should have a done event');
  assert.equal(typeof done!['message_id'], 'string', 'done.message_id should be a UUID string');
  assert.equal(done!['escalation'], false);
});

test('POST /api/chat persists user and assistant messages in DB', async () => {
  mockOpenAi();
  resetRateLimits();
  resetSessionRateLimits();

  const app = await build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/chat',
    headers: { origin: 'https://demo.example', 'content-type': 'application/json' },
    payload: { tenant_id: 'demo-bank', session_id: sessionId, message: 'What cards do you offer?' },
  });
  await app.close();

  assert.equal(res.statusCode, 200);
  const events = parseSseEvents(res.payload);
  const done = events.find(e => e['type'] === 'done') as Record<string, unknown>;
  const messageId = done?.['message_id'] as string;

  const { rows } = await pool.query<{ role: string; content: string }>(
    `SELECT role, content FROM messages WHERE session_id=$1 ORDER BY created_at`,
    [sessionId],
  );
  assert.ok(rows.some(r => r.role === 'user' && r.content === 'What cards do you offer?'));
  assert.ok(rows.some(r => r.role === 'assistant'));

  // Assistant message should have prompt_tokens set
  const { rows: assistantRows } = await pool.query<{ prompt_tokens: number }>(
    `SELECT prompt_tokens FROM messages WHERE id=$1`,
    [messageId],
  );
  assert.ok((assistantRows[0]?.prompt_tokens ?? 0) > 0);
});

test('POST /api/chat returns 404 for unknown session', async () => {
  mockOpenAi();
  const app = await build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/chat',
    headers: { origin: 'https://demo.example', 'content-type': 'application/json' },
    payload: {
      tenant_id: 'demo-bank',
      session_id: '00000000-0000-0000-0000-000000000000',
      message: 'Hello',
    },
  });
  await app.close();
  assert.equal(res.statusCode, 404);
});

test('POST /api/chat returns 404 for disallowed origin', async () => {
  mockOpenAi();
  const app = await build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/chat',
    headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    payload: { tenant_id: 'demo-bank', session_id: sessionId, message: 'Hello' },
  });
  await app.close();
  assert.equal(res.statusCode, 404);
});

test('POST /api/chat returns 404 for unknown tenant', async () => {
  mockOpenAi();
  const app = await build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/chat',
    headers: { origin: 'https://demo.example', 'content-type': 'application/json' },
    payload: { tenant_id: 'nonexistent', session_id: sessionId, message: 'Hello' },
  });
  await app.close();
  assert.equal(res.statusCode, 404);
});

test('POST /api/chat returns 400 for empty message', async () => {
  mockOpenAi();
  const app = await build();
  const res = await app.inject({
    method: 'POST',
    url: '/api/chat',
    headers: { origin: 'https://demo.example', 'content-type': 'application/json' },
    payload: { tenant_id: 'demo-bank', session_id: sessionId, message: '   ' },
  });
  await app.close();
  assert.equal(res.statusCode, 400);
});

test('POST /api/chat returns 429 when session rate limit is exceeded', async () => {
  mockOpenAi();
  resetRateLimits();
  resetSessionRateLimits();

  const app = await build();
  // Exhaust the session limit
  for (let i = 0; i < 30; i++) {
    checkSessionRateLimit(sessionId, 30);
  }

  const res = await app.inject({
    method: 'POST',
    url: '/api/chat',
    headers: { origin: 'https://demo.example', 'content-type': 'application/json' },
    payload: { tenant_id: 'demo-bank', session_id: sessionId, message: 'One more message' },
  });
  await app.close();
  assert.equal(res.statusCode, 429);
});
