import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildConversationMessages } from '../../src/rag/prompt.js';
import type { Tenant } from '../../src/tenants/types.js';
import type { RetrievedChunk } from '../../src/rag/retrieve.js';

const tenant: Tenant = {
  id: 'demo-bank',
  name: 'Demo Bank',
  status: 'active',
  allowedOrigins: ['https://demo.example'],
  config: {
    hotline: '1200',
    branding: { displayName: 'Demo Bank', logoUrl: null, accentColor: '#0a0' },
    languages: { default: 'ru', enabled: ['uz', 'ru', 'en'] },
    model: { chat: 'gpt-4o-mini', embedding: 'text-embedding-3-small' },
    limits: { ratePerMinPerIp: 60, messagesPerSessionPer10Min: 30, maxMessageLength: 2000, monthlyLlmBudgetUsd: 50 },
    greeting: { uz: 'Salom', ru: 'Здравствуйте', en: 'Hi' },
  },
};

const chunk: RetrievedChunk = {
  id: 'uuid-1',
  chunk_id: 'consumer-loan',
  title: 'Consumer Loan',
  content: 'Consumer loan details here.',
  answer: null,
  category: 'loans',
  cosine_score: 0.95,
  final_score: 0.97,
  frequency: 0,
};

test('buildSystemPrompt includes bank display name and language', () => {
  const prompt = buildSystemPrompt(tenant, 'ru', [chunk]);
  assert.ok(prompt.includes('Demo Bank'), 'must mention bank name');
  assert.ok(prompt.includes('русском'), 'must mention language name');
});

test('buildSystemPrompt includes ESCALATION_NEEDED instruction', () => {
  const prompt = buildSystemPrompt(tenant, 'ru', [chunk]);
  assert.ok(prompt.includes('ESCALATION_NEEDED'), 'must include escalation trigger phrase');
});

test('buildSystemPrompt includes hotline number', () => {
  const prompt = buildSystemPrompt(tenant, 'ru', [chunk]);
  assert.ok(prompt.includes('1200'), 'must include hotline number');
});

test('buildSystemPrompt wraps chunks in <source> tags', () => {
  const prompt = buildSystemPrompt(tenant, 'ru', [chunk]);
  assert.ok(prompt.includes('<source id="consumer-loan"'), 'chunk id in source tag');
  assert.ok(prompt.includes('Consumer loan details here.'), 'chunk content included');
  assert.ok(prompt.includes('</source>'), 'closing source tag');
});

test('buildSystemPrompt uses no-KB fallback when chunks array is empty', () => {
  const prompt = buildSystemPrompt(tenant, 'ru', []);
  assert.ok(!prompt.includes('<source'), 'no source tags for empty chunks');
  assert.ok(prompt.includes('No matching content found.'), 'fallback text present');
});

test('buildSystemPrompt language lock appears at start and end of prompt', () => {
  const prompt = buildSystemPrompt(tenant, 'uz', []);
  // The Uzbek language lock keyword appears in both the early LANG_LOCK section
  // and again in the final reminder (section 11)
  const lockKeyword = "O'zbek tilida";
  const firstOccurrence = prompt.indexOf(lockKeyword);
  const lastOccurrence = prompt.lastIndexOf(lockKeyword);
  assert.ok(firstOccurrence !== -1, 'language lock text present');
  assert.ok(firstOccurrence < lastOccurrence, 'language lock appears at least twice (start and end)');
});

test('buildConversationMessages prepends history and appends user message', () => {
  const history = [
    { role: 'user' as const, content: 'hi' },
    { role: 'assistant' as const, content: 'hello' },
  ];
  const msgs = buildConversationMessages(history, 'new question');
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0]!.content, 'hi');
  assert.equal(msgs[2]!.content, 'new question');
  assert.equal(msgs[2]!.role, 'user');
});

test('buildConversationMessages limits history to last 12 messages', () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
    content: `msg${i}`,
  }));
  const msgs = buildConversationMessages(history, 'final');
  assert.equal(msgs.length, 13); // 12 history + 1 new
});
