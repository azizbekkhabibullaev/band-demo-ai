import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool, closePool } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { clearTenantCache } from '../../src/tenants/resolver.js';
import { retrieveChunks } from '../../src/rag/retrieve.js';

const pool = getPool();
const DB_TEST_LOCK_KEY = 91823746;
let lockClient: PoolClient | null = null;

// 1536-dim vectors for testing:
// vecHigh: all 0.9 — cosine similarity with itself = 1.0
// vecLow:  all -0.9 — cosine similarity with vecHigh = -1.0
const vecHigh = '[' + Array(1536).fill(0.9).join(',') + ']';
const vecLow  = '[' + Array(1536).fill(-0.9).join(',') + ']';

const TENANT_CONFIG = {
  hotline: '1200',
  branding: { displayName: 'Demo Bank', logoUrl: null, accentColor: '#0a0' },
  languages: { default: 'ru', enabled: ['uz', 'ru', 'en'] },
  model: { chat: 'gpt-4o-mini', embedding: 'text-embedding-3-small' },
  limits: { ratePerMinPerIp: 60, messagesPerSessionPer10Min: 30, maxMessageLength: 2000, monthlyLlmBudgetUsd: 50 },
  greeting: { uz: 'Salom', ru: 'Здравствуйте', en: 'Hi' },
};

before(async () => {
  lockClient = await pool.connect();
  await lockClient.query('SELECT pg_advisory_lock($1)', [DB_TEST_LOCK_KEY]);
  await runMigrations();

  // demo-bank tenant
  await pool.query(`DELETE FROM tenants WHERE id IN ('demo-bank','other-bank')`);
  await pool.query(
    `INSERT INTO tenants (id, name, allowed_origins, config)
     VALUES ('demo-bank','Demo',ARRAY['https://demo.example'],$1::jsonb),
            ('other-bank','Other',ARRAY['https://other.example'],$1::jsonb)`,
    [JSON.stringify(TENANT_CONFIG)],
  );
  clearTenantCache();

  // Insert test chunks
  await pool.query(
    `INSERT INTO kb_chunks
       (tenant_id, lang, source_file, chunk_id, category, title, content, embedding, tokens, content_hash)
     VALUES
       ('demo-bank','ru','loans.md','consumer-loan','loans','Consumer Loan',
        'Consumer loan information: personal credit options and interest rates.', $1::vector, 60, 'h1'),
       ('demo-bank','ru','loans.md','auto-loan','loans','Auto Loan',
        'Auto financing for vehicles with competitive rates.', $2::vector, 55, 'h2'),
       ('other-bank','ru','loans.md','other-chunk','loans','Other Bank Chunk',
        'Consumer loan from other bank.', $1::vector, 50, 'h3'),
       ('demo-bank','uz','loans.md','uz-loan','loans','Kredit',
        'Iste''mol krediti haqida ma''lumot.', $1::vector, 50, 'h4')`,
    [vecHigh, vecLow],
  );
});

after(async () => {
  if (lockClient) {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [DB_TEST_LOCK_KEY]);
    lockClient.release();
    lockClient = null;
  }
  await closePool();
});

test('retrieveChunks returns top matching chunks in hybrid-score order', async () => {
  const queryEmbedding = Array(1536).fill(0.9); // same as vecHigh
  const result = await retrieveChunks({
    tenantId: 'demo-bank',
    lang: 'ru',
    embedding: queryEmbedding,
    query: 'consumer loan',
  });

  // consumer-loan chunk should be first (cosine=1.0, keyword matches "consumer" and "loan")
  assert.ok(result.length > 0);
  assert.equal(result[0]!.chunk_id, 'consumer-loan');
  assert.ok(result[0]!.final_score > 0.9, `expected final_score > 0.9, got ${result[0]!.final_score}`);
});

test('retrieveChunks does not return chunks from other tenants', async () => {
  const queryEmbedding = Array(1536).fill(0.9);
  const result = await retrieveChunks({
    tenantId: 'demo-bank',
    lang: 'ru',
    embedding: queryEmbedding,
    query: 'consumer loan',
  });

  const ids = result.map(r => r.chunk_id);
  assert.ok(!ids.includes('other-chunk'), 'other-bank chunk must not appear');
});

test('retrieveChunks does not return chunks from other languages', async () => {
  const queryEmbedding = Array(1536).fill(0.9);
  const result = await retrieveChunks({
    tenantId: 'demo-bank',
    lang: 'ru',
    embedding: queryEmbedding,
    query: 'loan',
  });

  const ids = result.map(r => r.chunk_id);
  assert.ok(!ids.includes('uz-loan'), 'uz-lang chunk must not appear in ru results');
});

test('retrieveChunks filters out chunks below threshold (cosine=-1.0)', async () => {
  const queryEmbedding = Array(1536).fill(0.9);
  const result = await retrieveChunks({
    tenantId: 'demo-bank',
    lang: 'ru',
    embedding: queryEmbedding,
    query: 'loan',
  });

  // auto-loan chunk has cosine=-1.0 (vecLow vs vecHigh) → final_score << 0 → filtered
  const ids = result.map(r => r.chunk_id);
  assert.ok(!ids.includes('auto-loan'), 'low-similarity chunk must be filtered out');
});

test('retrieveChunks returns empty array when no chunks exist for tenant+lang', async () => {
  const result = await retrieveChunks({
    tenantId: 'demo-bank',
    lang: 'en', // no EN chunks inserted
    embedding: Array(1536).fill(0.9),
    query: 'loan',
  });
  assert.deepEqual(result, []);
});

test('keyword boost works for Cyrillic (Russian) query', async () => {
  const pool = getPool();
  // Insert a chunk that contains the Russian word "кредит"
  const chunkId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO kb_chunks
       (id, tenant_id, lang, source_file, chunk_id, category, title, content, embedding, tokens, content_hash)
     VALUES ($1, $2, 'ru', 'credits.md', $3, 'credits', 'Кредит', 'Оформление кредита в нашем банке', $4::vector, 10, $5)`,
    [
      crypto.randomUUID(),
      'demo-bank',
      chunkId,
      vecHigh,
      crypto.randomUUID(), // unique per run — avoids content_hash uniqueness violation on reruns
    ],
  );

  const embedding = Array(1536).fill(0.9); // matches vecHigh
  const chunks = await retrieveChunks({
    tenantId: 'demo-bank',
    lang: 'ru',
    embedding,
    query: 'кредит',
    threshold: 0,
  });

  assert.ok(chunks.length > 0, 'should return at least one chunk');
  const hit = chunks.find(c => c.content.includes('кредит'));
  assert.ok(hit !== undefined, 'chunk containing "кредит" should be in results');
  // keyword score should be > 0 since "кредит" (5 chars) is in content
  assert.ok(hit!.final_score > hit!.cosine_score * 0.7, 'hybrid score should exceed pure cosine component');
});
