import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLeadIntent } from '../../src/features/leads/service.js';

// ── detectLeadIntent (pure function, no DB needed) ────────────────────────────

test('detectLeadIntent: callback signal detected from assistant message', () => {
  const type = detectLeadIntent(
    'мне нужна помощь',
    'Хотите, чтобы наш специалист перезвонил вам? Оставьте номер телефона.',
  );
  assert.equal(type, 'callback');
});

test('detectLeadIntent: callback signal from user message (raqam)', () => {
  const type = detectLeadIntent('mening raqamim +998901234567', '');
  assert.equal(type, 'callback');
});

test('detectLeadIntent: consultation signal from user message', () => {
  const type = detectLeadIntent('хочу получить консультацию по кредиту', '');
  assert.equal(type, 'consultation');
});

test('detectLeadIntent: specialist signal triggers consultation', () => {
  const type = detectLeadIntent('', 'Вы можете обратиться к нашему специалисту');
  assert.equal(type, 'consultation');
});

test('detectLeadIntent: no signal returns null', () => {
  const type = detectLeadIntent('какой курс доллара?', 'Курс: 12750 UZS за 1 USD');
  assert.equal(type, null);
});

test('detectLeadIntent: callback takes priority over consultation when both present', () => {
  // CALLBACK_SIGNALS come first in the check, so callback wins
  const type = detectLeadIntent(
    'хочу консультацию — перезвоните',
    'оставьте номер телефона',
  );
  assert.equal(type, 'callback');
});

test('detectLeadIntent: Uzbek callback signal (qo\'ng\'iroq)', () => {
  const type = detectLeadIntent("qo'ng'iroq qiling", '');
  assert.equal(type, 'callback');
});

test('detectLeadIntent: English callback signal', () => {
  const type = detectLeadIntent('please call back', '');
  assert.equal(type, 'callback');
});

test('detectLeadIntent: recommend signal triggers consultation', () => {
  const type = detectLeadIntent('помогите подобрать кредит', '');
  assert.equal(type, 'consultation');
});
