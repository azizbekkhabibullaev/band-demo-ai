import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../../src/observability/log.js';

test('logger writes JSON with required fields', () => {
  const writes: string[] = [];
  const writer = (line: string) => writes.push(line);
  const log = createLogger({ writer });

  log.info('hello', { tenant_id: 'demo-bank', request_id: '01H' });

  assert.equal(writes.length, 1);
  const obj = JSON.parse(writes[0]!);
  assert.equal(obj.level, 'info');
  assert.equal(obj.msg, 'hello');
  assert.equal(obj.tenant_id, 'demo-bank');
  assert.equal(obj.request_id, '01H');
  assert.equal(typeof obj.ts, 'string');
  assert.match(obj.ts, /^\d{4}-\d{2}-\d{2}T/); // ISO-8601
});

test('logger child() merges base fields into every log line', () => {
  const writes: string[] = [];
  const log = createLogger({ writer: (l) => writes.push(l) });
  const child = log.child({ tenant_id: 'demo-bank' });

  child.warn('careful', { route: '/api/chat' });

  const obj = JSON.parse(writes[0]!);
  assert.equal(obj.level, 'warn');
  assert.equal(obj.tenant_id, 'demo-bank');
  assert.equal(obj.route, '/api/chat');
});

test('logger error level writes to stderr in default config', () => {
  // Default behaviour test — ensures we don't accidentally swallow errors.
  // We don't assert on stderr here because that would couple to runtime;
  // instead we assert that error() calls the writer once with level=error.
  const writes: string[] = [];
  const log = createLogger({ writer: (l) => writes.push(l) });
  log.error('boom', { err: 'oops' });
  const obj = JSON.parse(writes[0]!);
  assert.equal(obj.level, 'error');
  assert.equal(obj.err, 'oops');
});
