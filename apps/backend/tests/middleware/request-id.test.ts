import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../../src/server.js';

test('every response includes an X-Request-Id header (ULID)', async () => {
  const app = await build();
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  const id = res.headers['x-request-id'];

  assert.ok(typeof id === 'string' && id.length > 0, 'expected x-request-id header');
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/, 'expected ULID format (26 Crockford base32 chars)');

  await app.close();
});

test('request-id from incoming X-Request-Id header is honored (and validated)', async () => {
  const app = await build();
  const valid = '01HZX0000000000000000000AB';
  const res = await app.inject({
    method: 'GET',
    url: '/api/health',
    headers: { 'x-request-id': valid },
  });

  assert.equal(res.headers['x-request-id'], valid);
  await app.close();
});

test('invalid incoming X-Request-Id is replaced (not echoed)', async () => {
  const app = await build();
  const res = await app.inject({
    method: 'GET',
    url: '/api/health',
    headers: { 'x-request-id': 'not-a-ulid; <script>' },
  });

  const id = res.headers['x-request-id'];
  assert.ok(typeof id === 'string');
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.notEqual(id, 'not-a-ulid; <script>');
  await app.close();
});

test('req.appLog is a child logger attached per request', async () => {
  const app = await build();

  let captured: unknown = null;
  app.get('/__test_log', async (req) => {
    captured = (req as unknown as { appLog: { info(msg: string, fields?: object): void } }).appLog;
    return { ok: true };
  });

  const res = await app.inject({ method: 'GET', url: '/__test_log' });
  assert.equal(res.statusCode, 200);
  assert.ok(captured !== null, 'expected appLog to be attached');
  // The child logger has the same shape as Logger.
  assert.equal(typeof (captured as { info: unknown }).info, 'function');

  await app.close();
});
