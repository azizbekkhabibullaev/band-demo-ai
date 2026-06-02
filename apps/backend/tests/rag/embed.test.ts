import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;

before(() => {
  process.env.OPENAI_API_KEY = 'test-key';
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }
});

const { embedText } = await import('../../src/rag/embed.js');

test('embedText returns the 1536-dim vector from OpenAI response', async () => {
  const fakeEmbedding = Array(1536).fill(0.1);
  let capturedUrl = '';
  let capturedMethod = '';
  let capturedAuth = '';
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedMethod = init?.method ?? '';
    capturedAuth = (init?.headers as Record<string, string>)?.['Authorization'] ?? '';
    return new Response(JSON.stringify({ data: [{ embedding: fakeEmbedding }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await embedText('test query', 'text-embedding-3-small');
  assert.equal(result.length, 1536);
  assert.equal(result[0], 0.1);
  assert.equal(capturedUrl, 'https://api.openai.com/v1/embeddings');
  assert.equal(capturedMethod, 'POST');
  assert.ok(capturedAuth.startsWith('Bearer '), `auth header should start with "Bearer ", got: ${capturedAuth}`);
});

test('embedText throws on non-OK status', async () => {
  globalThis.fetch = async () =>
    new Response('{"error":{"message":"invalid key"}}', { status: 401 });

  await assert.rejects(
    () => embedText('test', 'text-embedding-3-small'),
    /OpenAI embeddings 401/,
  );
});

test('embedText throws when OPENAI_API_KEY is not set', async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  await assert.rejects(
    () => embedText('test', 'text-embedding-3-small'),
    /OPENAI_API_KEY/,
  );

  if (saved === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = saved;
  }
});
