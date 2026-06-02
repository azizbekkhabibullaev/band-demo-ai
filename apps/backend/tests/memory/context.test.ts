import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeContext, type CustomerContext } from '../../src/memory/context.js';

// ── summarizeContext (pure function, no DB) ───────────────────────────────────

function makeCtx(overrides: Partial<CustomerContext> = {}): CustomerContext {
  return {
    sessionId: 'sess-1',
    tenantId: 'bank-1',
    detectedLang: undefined,
    preferredLang: undefined,
    productInterests: [],
    intentHistory: [],
    mentionedAmounts: [],
    mentionedTerms: [],
    lastIntent: undefined,
    lastTopic: undefined,
    escalated: false,
    leadCaptured: false,
    turnCount: 0,
    contextData: {},
    ...overrides,
  };
}

test('summarizeContext: returns empty string when turnCount is 0', () => {
  const result = summarizeContext(makeCtx({ turnCount: 0 }));
  assert.equal(result, '');
});

test('summarizeContext: returns empty string when turnCount > 0 but no data', () => {
  const result = summarizeContext(makeCtx({ turnCount: 3 }));
  assert.equal(result, '');
});

test('summarizeContext: includes product interests', () => {
  const ctx = makeCtx({ turnCount: 2, productInterests: ['depozit', 'kredit_ariza'] });
  const result = summarizeContext(ctx);
  assert.ok(result.includes('depozit'), 'should mention depozit interest');
  assert.ok(result.includes('kredit_ariza'), 'should mention kredit_ariza interest');
});

test('summarizeContext: deduplicates product interests', () => {
  const ctx = makeCtx({ turnCount: 2, productInterests: ['depozit', 'depozit', 'depozit'] });
  const result = summarizeContext(ctx);
  const matches = result.match(/depozit/g) ?? [];
  assert.equal(matches.length, 1, 'depozit should appear only once after dedup');
});

test('summarizeContext: includes recent intents (last 3)', () => {
  const ctx = makeCtx({
    turnCount: 5,
    intentHistory: ['kredit_ariza', 'kredit_holati', 'kredit_tolov', 'depozit', 'valyuta'],
  });
  const result = summarizeContext(ctx);
  // Last 3 unique intents after dedup and slice
  assert.ok(result.includes('kredit_tolov') || result.includes('depozit') || result.includes('valyuta'));
  // First intent should not appear (it's outside the last 3)
  assert.ok(!result.includes('kredit_ariza'), 'old intents should be pruned');
});

test('summarizeContext: includes mentioned amounts', () => {
  const ctx = makeCtx({ turnCount: 1, mentionedAmounts: ['5000000', '10000000'] });
  const result = summarizeContext(ctx);
  assert.ok(result.includes('5000000') || result.includes('10000000'));
});

test('summarizeContext: limits amounts to last 2', () => {
  const ctx = makeCtx({ turnCount: 1, mentionedAmounts: ['1m', '2m', '3m', '4m'] });
  const result = summarizeContext(ctx);
  assert.ok(result.includes('3m'), 'third-to-last included');
  assert.ok(result.includes('4m'), 'last included');
  assert.ok(!result.includes('1m'), 'first should be pruned');
});

test('summarizeContext: includes last topic', () => {
  const ctx = makeCtx({ turnCount: 1, lastTopic: 'mortgage' });
  const result = summarizeContext(ctx);
  assert.ok(result.includes('mortgage'));
});

test('summarizeContext: output starts with Customer Memory heading', () => {
  const ctx = makeCtx({ turnCount: 1, lastTopic: 'cards' });
  const result = summarizeContext(ctx);
  assert.ok(result.includes('Customer Memory') || result.includes('🧠'));
});

test('summarizeContext: mentioned terms included', () => {
  const ctx = makeCtx({ turnCount: 1, mentionedTerms: ['12 months', '24 months'] });
  const result = summarizeContext(ctx);
  assert.ok(result.includes('12 months') || result.includes('24 months'));
});
