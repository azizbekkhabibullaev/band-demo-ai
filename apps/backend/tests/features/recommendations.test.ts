import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGoal,
  buildRecommendations,
  renderRecommendations,
  type CustomerGoal,
} from '../../src/features/recommendations/engine.js';

// ── extractGoal ───────────────────────────────────────────────────────────────

test('extractGoal: deposit intent maps to deposit type with max_return priority', () => {
  const goal = extractGoal('depozit', 'хочу вложить деньги');
  assert.equal(goal.type, 'deposit');
  assert.equal(goal.priority, 'max_return');
});

test('extractGoal: kredit_ariza intent maps to loan with speed priority', () => {
  const goal = extractGoal('kredit_ariza', 'нужен кредит срочно');
  assert.equal(goal.type, 'loan');
  assert.equal(goal.priority, 'speed');
});

test('extractGoal: null intent falls back to text inference for loan', () => {
  const goal = extractGoal(null, 'хочу взять кредит на машину');
  assert.equal(goal.type, 'loan');
});

test('extractGoal: amount parsed from query', () => {
  const goal = extractGoal('depozit', 'хочу вложить 5 000 000 сум');
  assert.equal(goal.amountHint, 5000000);
});

test('extractGoal: million parsed from query', () => {
  const goal = extractGoal('depozit', 'вложить 2 млн');
  assert.equal(goal.amountHint, 2000000);
});

test('extractGoal: term parsed from query', () => {
  const goal = extractGoal('kredit_ariza', 'кредит на 12 месяцев');
  assert.equal(goal.termMonths, 12);
});

test('extractGoal: USD currency detected', () => {
  const goal = extractGoal('depozit', 'вклад в USD');
  assert.equal(goal.currency, 'usd');
});

test('extractGoal: defaults to UZS currency', () => {
  const goal = extractGoal('depozit', 'хочу вложить деньги');
  assert.equal(goal.currency, 'uzs');
});

test('extractGoal: unknown intent string returns safe defaults', () => {
  const goal = extractGoal('nonexistent_intent', 'something random');
  assert.ok(goal.type, 'should have a type');
  assert.ok(goal.currency, 'should have a currency');
});

// ── buildRecommendations ──────────────────────────────────────────────────────

test('buildRecommendations: deposit returns up to 3 recommendations', () => {
  const goal: CustomerGoal = { type: 'deposit', priority: 'max_return', amountHint: undefined, termMonths: undefined, currency: 'uzs' };
  const result = buildRecommendations(goal);
  assert.ok(result.recommendations.length > 0, 'should have recommendations');
  assert.ok(result.recommendations.length <= 3, 'should have at most 3 recommendations');
  assert.ok(result.consultantNote.length > 0, 'should have consultant note');
});

test('buildRecommendations: deposit with max_return puts DaroMax first', () => {
  const goal: CustomerGoal = { type: 'deposit', priority: 'max_return', amountHint: undefined, termMonths: undefined, currency: 'uzs' };
  const result = buildRecommendations(goal);
  assert.equal(result.recommendations[0]!.productId, 'daromax-24');
});

test('buildRecommendations: deposit with flexibility reorders savings first', () => {
  const goal: CustomerGoal = { type: 'deposit', priority: 'flexibility', amountHint: undefined, termMonths: undefined, currency: 'uzs' };
  const result = buildRecommendations(goal);
  assert.equal(result.recommendations[0]!.productId, 'savings-account');
});

test('buildRecommendations: loan returns loan products', () => {
  const goal: CustomerGoal = { type: 'loan', priority: 'speed', amountHint: undefined, termMonths: undefined, currency: 'uzs' };
  const result = buildRecommendations(goal);
  assert.equal(result.recommendations[0]!.productId, 'consumer-loan');
});

test('buildRecommendations: card type returns card products', () => {
  const goal: CustomerGoal = { type: 'card', priority: 'unknown', amountHint: undefined, termMonths: undefined, currency: 'uzs' };
  const result = buildRecommendations(goal);
  assert.ok(result.recommendations.length > 0);
  assert.ok(result.recommendations[0]!.productId.includes('uzcard') || result.recommendations[0]!.productId.includes('visa'));
});

test('buildRecommendations: account/currency type returns empty recommendations', () => {
  const goal: CustomerGoal = { type: 'account', priority: 'unknown', amountHint: undefined, termMonths: undefined, currency: 'uzs' };
  const result = buildRecommendations(goal);
  assert.equal(result.recommendations.length, 0);
});

test('buildRecommendations: deposit with amount hint mentions amount in consultant note', () => {
  const goal: CustomerGoal = { type: 'deposit', priority: 'max_return', amountHint: 5_000_000, termMonths: undefined, currency: 'uzs' };
  const result = buildRecommendations(goal);
  assert.ok(result.consultantNote.includes('5'), 'note should mention the amount');
});

// ── renderRecommendations ─────────────────────────────────────────────────────

test('renderRecommendations: returns empty string for zero recommendations', () => {
  const result = buildRecommendations({ type: 'account', priority: 'unknown', amountHint: undefined, termMonths: undefined, currency: 'uzs' });
  const md = renderRecommendations(result, 'ru');
  assert.equal(md, '');
});

test('renderRecommendations: Russian output contains medal emoji', () => {
  const goal: CustomerGoal = { type: 'deposit', priority: 'max_return', amountHint: undefined, termMonths: undefined, currency: 'uzs' };
  const result = buildRecommendations(goal);
  const md = renderRecommendations(result, 'ru');
  assert.ok(md.includes('🥇'), 'gold medal for top pick');
  assert.ok(md.includes('DaroMax'), 'top deposit product');
});

test('renderRecommendations: Uzbek header used when lang=uz', () => {
  const goal: CustomerGoal = { type: 'deposit', priority: 'max_return', amountHint: undefined, termMonths: undefined, currency: 'uzs' };
  const result = buildRecommendations(goal);
  const md = renderRecommendations(result, 'uz');
  assert.ok(md.includes('eng yaxshi'), 'uz header used');
});

test('renderRecommendations: English header used when lang=en', () => {
  const goal: CustomerGoal = { type: 'loan', priority: 'speed', amountHint: undefined, termMonths: undefined, currency: 'uzs' };
  const result = buildRecommendations(goal);
  const md = renderRecommendations(result, 'en');
  assert.ok(md.includes('Best loan options'), 'en header used');
});

test('renderRecommendations: consultant note appended after dashes', () => {
  const goal: CustomerGoal = { type: 'deposit', priority: 'max_return', amountHint: undefined, termMonths: undefined, currency: 'uzs' };
  const result = buildRecommendations(goal);
  const md = renderRecommendations(result, 'ru');
  assert.ok(md.includes('---'), 'divider before consultant note');
  assert.ok(md.includes(result.consultantNote), 'consultant note present');
});
