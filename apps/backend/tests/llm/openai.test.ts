import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { streamChatCompletion } from '../../src/llm/openai.js';

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

function makeSseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

const BASE_PARAMS = {
  apiKey: 'test-key',
  model: 'gpt-4o-mini',
  systemPrompt: 'You are a banking assistant.',
  messages: [{ role: 'user', content: 'Hello' }],
};

test('streamChatCompletion collects text deltas and returns token counts', async () => {
  globalThis.fetch = async () => {
    const stream = makeSseStream([
      'data: {"id":"1","choices":[{"delta":{"content":"Здравствуйте"}}]}\n\n',
      'data: {"id":"1","choices":[{"delta":{"content":"!"}}]}\n\n',
      'data: {"id":"1","choices":[{"delta":{}}],"usage":{"prompt_tokens":12,"completion_tokens":4}}\n\n',
      'data: [DONE]\n\n',
    ]);
    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  };

  const deltas: string[] = [];
  const result = await streamChatCompletion(BASE_PARAMS, { onDelta: t => deltas.push(t) });

  assert.deepEqual(deltas, ['Здравствуйте', '!']);
  assert.equal(result.promptTokens, 12);
  assert.equal(result.completionTokens, 4);
});

test('streamChatCompletion handles chunks split across multiple SSE reads', async () => {
  const encoder = new TextEncoder();
  // Deliberately split the SSE line across two enqueue calls
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"id":"1","choices":[{"delta":{"con'));
      controller.enqueue(encoder.encode('tent":"Hi"}}]}\n\ndata: [DONE]\n\n'));
      controller.close();
    },
  });

  globalThis.fetch = async () =>
    new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });

  const deltas: string[] = [];
  await streamChatCompletion(BASE_PARAMS, { onDelta: t => deltas.push(t) });

  assert.deepEqual(deltas, ['Hi']);
});

test('streamChatCompletion throws on non-OK status', async () => {
  globalThis.fetch = async () =>
    new Response('{"error":{"message":"invalid key"}}', { status: 401 });

  await assert.rejects(
    () => streamChatCompletion(BASE_PARAMS, { onDelta: () => {} }),
    /OpenAI chat 401/,
  );
});

test('streamChatCompletion returns zero tokens when usage chunk absent', async () => {
  globalThis.fetch = async () => {
    const stream = makeSseStream([
      'data: {"id":"1","choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };

  const result = await streamChatCompletion(BASE_PARAMS, { onDelta: () => {} });
  assert.equal(result.promptTokens, 0);
  assert.equal(result.completionTokens, 0);
});
