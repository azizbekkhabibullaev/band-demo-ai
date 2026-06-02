// Safety: `DROP SCHEMA public CASCADE` is destructive. Refuse to run against anything
// that isn't a localhost or test DATABASE_URL.
{
  const url = process.env.DATABASE_URL ?? 'postgres://chatbot:chatbot@localhost:5433/chatbot_test';
  if (!/localhost|127\.0\.0\.1|bank-chatbot-pg/.test(url)) {
    throw new Error(`migrate.test.ts refuses to run against non-local DATABASE_URL: ${url}`);
  }
  // Extra safety: never run destructive tests against the production 'chatbot' DB
  if (/\/chatbot$/.test(new URL(url).pathname)) {
    throw new Error(`migrate.test.ts refuses to run against production database 'chatbot'. Use 'chatbot_test'.`);
  }
}

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getPool, closePool } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

const pool = getPool();

// Shared advisory lock key used by all DB-mutating tests to serialize against
// each other. Node's --test runner executes test files in parallel child
// processes; without serialization, concurrent DROP SCHEMA / runMigrations
// calls race on the public schema and the _migrations table.
const DB_TEST_LOCK_KEY = 91823746;
let lockClient: import('pg').PoolClient | null = null;

before(async () => {
  // Hold the lock on a dedicated connection for the lifetime of the test file
  // so pg_advisory_unlock() runs on the same session that acquired the lock.
  lockClient = await pool.connect();
  await lockClient.query('SELECT pg_advisory_lock($1)', [DB_TEST_LOCK_KEY]);
  // Fully reset the public schema so migrations can re-apply cleanly.
  // Drops all tables (including _migrations and any future app tables) and the
  // pgvector extension (which migration 0002 recreates via CREATE EXTENSION IF NOT EXISTS).
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  // Required for gen_random_uuid() — DROP SCHEMA may have removed pgcrypto,
  // but it's typically in pg_catalog so this is defensive. pgvector recreates itself in 0002.
  await pool.query('GRANT ALL ON SCHEMA public TO chatbot');
});

after(async () => {
  if (lockClient) {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [DB_TEST_LOCK_KEY]);
    lockClient.release();
    lockClient = null;
  }
  await closePool();
});

test('runMigrations creates the _migrations table and records applied files', async () => {
  await runMigrations();

  const { rows } = await pool.query<{ filename: string }>(
    'SELECT filename FROM _migrations ORDER BY filename'
  );
  assert.ok(rows.length >= 1, 'expected at least one applied migration');
  assert.ok(
    rows.every((r) => /^\d{4}_.*\.sql$/.test(r.filename)),
    'all recorded filenames must match NNNN_*.sql'
  );
});

test('runMigrations is idempotent (running twice applies zero new migrations)', async () => {
  const before = await pool.query<{ filename: string }>('SELECT filename FROM _migrations');
  await runMigrations();
  const after = await pool.query<{ filename: string }>('SELECT filename FROM _migrations');
  assert.equal(after.rows.length, before.rows.length);
});
