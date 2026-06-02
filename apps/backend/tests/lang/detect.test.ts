import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLanguage } from '../../src/lang/detect.js';

test('detects pure Russian (Cyrillic)', () => {
  assert.equal(detectLanguage('Здравствуйте, как дела?'), 'ru');
  assert.equal(detectLanguage('Хочу взять кредит'), 'ru');
});

test('detects pure English (Latin)', () => {
  assert.equal(detectLanguage('What is the loan rate?'), 'en');
  assert.equal(detectLanguage('I would like to open a card'), 'en');
});

test('detects Uzbek by characteristic words', () => {
  assert.equal(detectLanguage('Kredit foiz stavkasi qancha?'), 'uz');
  assert.equal(detectLanguage("Men avtokredit olmoqchiman, qanday qilaman?"), 'uz');
});

test("detects Uzbek by apostrophe markers (o', g')", () => {
  assert.equal(detectLanguage("Iste'mol krediti"), 'uz');
  assert.equal(detectLanguage("o'zbekiston"), 'uz');
});

test('detects Russian for Cyrillic with no specific markers', () => {
  assert.equal(detectLanguage('абв'), 'ru');
});

test('falls back to ru for empty/whitespace input', () => {
  assert.equal(detectLanguage(''), 'ru');
  assert.equal(detectLanguage('   '), 'ru');
});

test('returns ru for ambiguous short Latin input', () => {
  assert.equal(detectLanguage('xyz'), 'ru');
});

test('handles mixed Cyrillic + Latin (favors Cyrillic when present)', () => {
  assert.equal(detectLanguage('USD курс'), 'ru');
});

test('distinguishes Russian-exclusive characters (ё, ъ, ы, э)', () => {
  assert.equal(detectLanguage('ёлка'), 'ru');
  assert.equal(detectLanguage('подъезд'), 'ru');
});
