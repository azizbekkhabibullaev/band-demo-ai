/**
 * domain-guard.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Automated tests proving that off-topic queries are BLOCKED and
 * banking queries PASS the domain guardrail.
 *
 * Run: cd apps/backend && node --import tsx/esm --test tests/rag/domain-guard.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDomainRelevance, getOffTopicResponse } from '../../src/rag/domain-guard.js';

// ─── Banking queries — MUST be allowed ───────────────────────────────────────

const BANKING_QUERIES = [
  // English
  'What are the deposit rates?',
  'I want to open a savings account',
  'How do I get a credit card?',
  'What is the loan interest rate for mortgages?',
  'My card is blocked, what should I do?',
  'How to transfer money to another bank?',
  'I need help with mobile banking',
  'Where is the nearest ATM?',
  'What documents are needed for a loan?',
  // Russian
  'Какой процент по вкладу?',
  'Хочу оформить карту',
  'Моя карта заблокирована',
  'Как сделать перевод?',
  'Условия по ипотеке',
  // Uzbek
  'Depozit stavkalari qanday?',
  'Kredit olish uchun nima kerak?',
  'Kartam bloklandi, nima qilaman?',
  "Ipoteka bank filiali qayerda joylashgan?",
];

for (const query of BANKING_QUERIES) {
  test(`ALLOW: banking query — "${query.slice(0, 60)}"`, () => {
    const result = checkDomainRelevance(query);
    assert.equal(
      result.allowed,
      true,
      `Expected banking query to be ALLOWED but got blocked by: ${result.blockedBy}`,
    );
  });
}

// ─── Off-topic queries — MUST be blocked ─────────────────────────────────────

const OFF_TOPIC_QUERIES: Array<{ query: string; expectedRule?: string }> = [
  // Programming
  { query: 'How do I write a Python function?', expectedRule: 'programming' },
  { query: 'Write a JavaScript program to sort an array', expectedRule: 'programming' },
  { query: 'What is React and how does it work?', expectedRule: 'programming' },
  { query: 'Explain Docker containers', expectedRule: 'programming' },
  { query: 'How to use machine learning?', expectedRule: 'programming' },
  { query: 'What is a REST API?', expectedRule: 'programming' },

  // Medicine
  { query: 'What is the dosage for ibuprofen?', expectedRule: 'medicine' },
  { query: 'I have a headache, which tablet should I take?', expectedRule: 'medicine' },
  { query: 'Is paracetamol safe during pregnancy?', expectedRule: 'medicine' },
  { query: "What are the symptoms of diabetes?", expectedRule: 'medicine' },

  // Politics
  { query: 'Who is the president of Uzbekistan?', expectedRule: 'politics' },
  { query: 'What does parliament do?', expectedRule: 'politics' },
  { query: 'Tell me about the election results', expectedRule: 'politics' },

  // History & geography
  { query: 'What happened in World War 2?', expectedRule: 'history_geography' },
  { query: 'Tell me about ancient civilizations', expectedRule: 'history_geography' },
  { query: 'What is the capital city of France?', expectedRule: 'history_geography' },

  // Education / courses
  { query: 'Recommend me a course for learning Python' }, // may fire as 'programming' or 'education'
  { query: 'What is the best university in Tashkent?', expectedRule: 'education' },
  { query: 'Suggest me an online course for data science' }, // may fire as 'programming' or 'education'

  // Language learning
  { query: "How do I learn English grammar?", expectedRule: 'language_learning' },
  { query: 'Teach me Russian verbs' }, // 'teach me' triggers 'education' first — still blocked

  // Cooking
  { query: 'Give me a recipe for plov', expectedRule: 'cooking' },
  { query: 'How to cook lagman?', expectedRule: 'cooking' },
  { query: 'What ingredients do I need for pizza?', expectedRule: 'cooking' },

  // Entertainment & sports
  { query: 'What movies are on Netflix this week?', expectedRule: 'entertainment' },
  { query: 'Who won the football match yesterday?', expectedRule: 'entertainment' },
  { query: 'Recommend a good TV series', expectedRule: 'entertainment' },
  { query: 'Tell me about the latest music albums', expectedRule: 'entertainment' },

  // Math & science
  { query: 'Solve this integral for me', expectedRule: 'math_science' },
  { query: 'What is the Pythagorean theorem?', expectedRule: 'math_science' },
  { query: 'Explain quantum physics', expectedRule: 'math_science' },

  // General chat / jokes
  { query: 'Tell me a joke', expectedRule: 'general_chat' },
  { query: 'Write a poem for me', expectedRule: 'general_chat' },
  { query: 'Tell me about yourself', expectedRule: 'general_chat' },

  // Russian off-topic
  { query: 'Как приготовить плов?', expectedRule: 'cooking' },
  { query: 'Расскажи анекдот' }, // may fire as 'entertainment' or 'general_chat' — blocked either way
  { query: 'Что такое алгебра?', expectedRule: 'math_science' },
  { query: 'Кто такой Путин?', expectedRule: 'politics' },

  // Uzbek off-topic
  { query: 'Plov qanday pishiriladi?', expectedRule: 'cooking' },
  { query: 'Python dasturlash tilini o\'rganing', expectedRule: 'programming' },
];

for (const { query, expectedRule } of OFF_TOPIC_QUERIES) {
  test(`BLOCK: off-topic query — "${query.slice(0, 60)}"`, () => {
    const result = checkDomainRelevance(query);
    assert.equal(
      result.allowed,
      false,
      `Expected off-topic query to be BLOCKED but it was allowed`,
    );
    if (expectedRule) {
      assert.equal(
        result.blockedBy,
        expectedRule,
        `Expected rule "${expectedRule}" but got "${result.blockedBy}"`,
      );
    }
  });
}

// ─── Localized off-topic responses ───────────────────────────────────────────

test('getOffTopicResponse returns UZ text for lang=uz', () => {
  const resp = getOffTopicResponse('uz');
  assert.ok(resp.includes('bank'), 'UZ response should mention bank');
  assert.ok(resp.length > 50);
});

test('getOffTopicResponse returns RU text for lang=ru', () => {
  const resp = getOffTopicResponse('ru');
  assert.ok(resp.includes('банк'), 'RU response should mention банк');
  assert.ok(resp.length > 50);
});

test('getOffTopicResponse falls back to RU for unknown lang', () => {
  const resp = getOffTopicResponse('xx');
  assert.ok(resp.includes('банк'), 'Fallback should be Russian');
});

test('getOffTopicResponse returns EN text for lang=en', () => {
  const resp = getOffTopicResponse('en');
  assert.ok(resp.includes('bank'), 'EN response should mention bank');
  assert.ok(resp.length > 50);
});
