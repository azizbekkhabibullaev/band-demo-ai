import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from '../../src/server.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

test('GET /api/health returns 200 with status payload', async () => {
  const app = await build();
  const res = await app.inject({ method: 'GET', url: '/api/health' });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.uptime_seconds, 'number');
  assert.equal(body.version, pkg.version);

  await app.close();
});
