import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackEvent } from '../../src/analytics/tracker.js';

// ── trackEvent (fire-and-forget) ──────────────────────────────────────────────
// trackEvent must never throw regardless of DB state or input.

test('trackEvent: does not throw with full params', () => {
  assert.doesNotThrow(() => {
    trackEvent({
      tenantId: 'test-tenant',
      sessionId: '00000000-0000-0000-0000-000000000001',
      messageId: '00000000-0000-0000-0000-000000000002',
      eventType: 'chat_turn',
      lang: 'ru',
      routingTier: 'kb_context',
      confidence: 0.85,
      intentName: 'depozit',
      faqId: undefined,
      kbChunkIds: ['chunk-1', 'chunk-2'],
      latencyMs: 342,
      promptTokens: 512,
      completionTokens: 128,
    });
  });
});

test('trackEvent: does not throw with minimal params', () => {
  assert.doesNotThrow(() => {
    trackEvent({ tenantId: 'test-tenant', eventType: 'session_started' });
  });
});

test('trackEvent: does not throw when DB is unavailable (fire-and-forget)', async () => {
  // Even if the DB insert fails internally, the public API must not throw.
  // We call trackEvent without a running DB connection and verify no exception
  // bubbles synchronously. The async failure is silently swallowed internally.
  assert.doesNotThrow(() => {
    trackEvent({ tenantId: 'no-db', eventType: 'escalation' });
  });
  // Give the fire-and-forget promise a tick to resolve/reject
  await new Promise(r => setTimeout(r, 10));
  // If we reach here, no unhandled rejection crashed the process
  assert.ok(true, 'no crash from failed async insert');
});

test('trackEvent: returns void synchronously', () => {
  const ret = trackEvent({ tenantId: 'test', eventType: 'faq_hit' });
  assert.equal(ret, undefined, 'trackEvent returns void');
});

test('trackEvent: all EventType variants are accepted without throwing', () => {
  const types = [
    'chat_turn', 'faq_hit', 'kb_hit', 'intent_detected', 'escalation',
    'lead_captured', 'recommendation_shown', 'product_viewed',
    'session_started', 'session_ended',
  ] as const;

  for (const eventType of types) {
    assert.doesNotThrow(() => {
      trackEvent({ tenantId: 'test', eventType });
    }, `trackEvent must not throw for eventType: ${eventType}`);
  }
});
