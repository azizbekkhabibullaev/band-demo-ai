/**
 * Recommendation Engine — Enterprise Banking AI Platform
 *
 * Converts customer intent + conversation context into structured product
 * recommendations that the Premium Banker prompt injects as consultant advice.
 *
 * Supports:
 *   - Deposit / savings recommendations
 *   - Loan / credit recommendations
 *   - Card recommendations
 *   - Cross-sell triggers
 */

export type ProductType = 'deposit' | 'loan' | 'card' | 'account' | 'insurance' | 'currency';

export interface CustomerGoal {
  type: ProductType;
  priority: 'max_return' | 'flexibility' | 'speed' | 'low_cost' | 'security' | 'unknown';
  amountHint: number | undefined;
  termMonths: number | undefined;
  currency: 'uzs' | 'usd' | 'eur';
}

export interface ProductRecommendation {
  rank: number;           // 1 = top pick
  productId: string;
  productName: string;
  tagline: string;        // One-line why this is recommended
  highlights: string[];   // 2-4 bullet points of key metrics
  bestFor: string;        // Short "best if..." statement
  ctaLabel: string;       // Call-to-action text
}

export interface RecommendationResult {
  goal: CustomerGoal;
  recommendations: ProductRecommendation[];
  consultantNote: string; // Personalised follow-up question to gather more info
}

// ─── Intent → Goal mapping ───────────────────────────────────────────────────

const INTENT_TO_GOAL: Record<string, Partial<CustomerGoal>> = {
  depozit:          { type: 'deposit',  priority: 'max_return' },
  kredit_ariza:     { type: 'loan',     priority: 'speed' },
  kredit_holati:    { type: 'loan',     priority: 'unknown' },
  kredit_tolov:     { type: 'loan',     priority: 'low_cost' },
  kredit_muddati:   { type: 'loan',     priority: 'flexibility' },
  kredit_tatil:     { type: 'loan',     priority: 'flexibility' },
  karta_chiqarish:  { type: 'card',     priority: 'unknown' },
  karta_blok:       { type: 'card',     priority: 'security' },
  hisob_ochish:     { type: 'account',  priority: 'unknown' },
  valyuta:          { type: 'currency', priority: 'unknown' },
};

// ─── Product catalogue (sourced from KB; rates verified by bank) ──────────────
// NOTE: Never hard-code rates that change. These are display templates only —
// actual rates must always be confirmed via the hotline or the bank's website.

const DEPOSIT_CATALOGUE: ProductRecommendation[] = [
  {
    rank: 1,
    productId: 'daromax-24',
    productName: 'DaroMax',
    tagline: 'Максимальная доходность — лучший срочный вклад',
    highlights: [
      '📈 Ставка: 18% годовых',
      '⏳ Срок: 24 месяца',
      '💰 Минимум: 500 000 UZS',
      '🔒 Фиксированная ставка на весь срок',
    ],
    bestFor: 'Если цель — максимальный доход и деньги не нужны досрочно',
    ctaLabel: 'Оформить DaroMax',
  },
  {
    rank: 2,
    productId: 'savings-account',
    productName: 'Накопительный счёт',
    tagline: 'Гибкость + доходность для активных накоплений',
    highlights: [
      '📈 Ставка: до 14% годовых',
      '✅ Пополнение в любое время',
      '✅ Частичное снятие без потери %',
      '💰 Минимум: 15 000 000 UZS',
    ],
    bestFor: 'Если нужна свобода управления деньгами при хорошей ставке',
    ctaLabel: 'Открыть накопительный счёт',
  },
  {
    rank: 3,
    productId: 'demand-deposit',
    productName: 'Вклад до востребования',
    tagline: 'Безопасное хранение с мгновенным доступом',
    highlights: [
      '⚡ Снятие в любое время',
      '🔄 Без ограничений по операциям',
      '💰 Минимум: 100 000 UZS',
      '🛡️ Застрахован государством',
    ],
    bestFor: 'Если деньги могут понадобиться в любой момент',
    ctaLabel: 'Открыть вклад',
  },
];

const LOAN_CATALOGUE: ProductRecommendation[] = [
  {
    rank: 1,
    productId: 'consumer-loan',
    productName: 'Потребительский кредит',
    tagline: 'Быстрое решение для любых целей',
    highlights: [
      '⚡ Решение за 1 день',
      '📋 Минимум документов',
      '💳 Перевод на карту',
      '📅 Срок: до 36 месяцев',
    ],
    bestFor: 'Для покупок и личных нужд без залога',
    ctaLabel: 'Подать заявку',
  },
  {
    rank: 2,
    productId: 'mortgage',
    productName: 'Ипотека',
    tagline: 'Ваш путь к собственному жилью',
    highlights: [
      '🏠 Покупка жилья на первичном и вторичном рынке',
      '📅 Срок: до 25 лет',
      '💰 Первоначальный взнос: от 20%',
      '🤝 Государственные программы',
    ],
    bestFor: 'Для приобретения недвижимости с долгосрочным планированием',
    ctaLabel: 'Рассчитать ипотеку',
  },
  {
    rank: 3,
    productId: 'car-loan',
    productName: 'Автокредит',
    tagline: 'За рулём своего авто уже сегодня',
    highlights: [
      '🚗 Новые и подержанные автомобили',
      '📅 Срок: до 60 месяцев',
      '⚡ Быстрое оформление',
      '💰 Минимальный первоначальный взнос',
    ],
    bestFor: 'Для покупки автомобиля с удобными ежемесячными платежами',
    ctaLabel: 'Оформить автокредит',
  },
];

const CARD_CATALOGUE: ProductRecommendation[] = [
  {
    rank: 1,
    productId: 'uzcard-classic',
    productName: 'UzCard Classic',
    tagline: 'Базовая карта для повседневных расчётов',
    highlights: [
      '🛒 Оплата в любых магазинах',
      '💳 Кэшбэк на популярных категориях',
      '📱 Подключена к мобильному приложению',
      '🔄 Бесплатные переводы между клиентами банка',
    ],
    bestFor: 'Для ежедневных покупок и оплаты услуг',
    ctaLabel: 'Оформить карту',
  },
  {
    rank: 2,
    productId: 'visa-gold',
    productName: 'Visa Gold',
    tagline: 'Премиум-карта с расширенными возможностями',
    highlights: [
      '🌍 Оплата за рубежом',
      '💎 Повышенный кэшбэк',
      '🛡️ Страхование путешествий',
      '🏦 Консьерж-сервис',
    ],
    bestFor: 'Для путешествий и онлайн-покупок в валюте',
    ctaLabel: 'Оформить Visa Gold',
  },
];

// ─── Goal extraction from conversation context ────────────────────────────────

const AMOUNT_PATTERN = /(\d[\d\s]*(?:000|млн|miln|million))/gi;
const TERM_PATTERN   = /(\d+)\s*(?:месяц|mese|month|yil|год|year|oy)/gi;

export function extractGoal(
  intentName: string | null,
  query: string,
): CustomerGoal {
  const base: Partial<CustomerGoal> = (intentName ? INTENT_TO_GOAL[intentName] : undefined) ?? {};
  const type: ProductType = base.type ?? inferProductType(query);
  const priority = base.priority ?? inferPriority(query, type);

  // Extract amount hints
  const amountMatch = query.match(AMOUNT_PATTERN);
  const amountHint = amountMatch
    ? parseAmount(amountMatch[0]!)
    : undefined;

  // Extract term hints
  const termMatch = TERM_PATTERN.exec(query);
  const termMonths = termMatch
    ? parseInt(termMatch[1]!, 10)
    : undefined;

  // Currency
  const currency = /usd|доллар|dollar/i.test(query)
    ? 'usd'
    : /eur|евро|euro/i.test(query)
    ? 'eur'
    : 'uzs';

  return { type, priority, amountHint: amountHint ?? undefined, termMonths: termMonths ?? undefined, currency };
}

function inferProductType(query: string): ProductType {
  if (/depozit|вклад|omonat|накоп/i.test(query)) return 'deposit';
  if (/kredit|кредит|qarz|займ|loan/i.test(query)) return 'loan';
  if (/karta|карта|card/i.test(query)) return 'card';
  if (/hisob|счёт|account/i.test(query)) return 'account';
  if (/valyuta|валют|currency|exchange/i.test(query)) return 'currency';
  return 'deposit'; // safe default
}

function inferPriority(query: string, type: ProductType): CustomerGoal['priority'] {
  if (/foydali|выгодн|max|makism|лучший|best/i.test(query)) return 'max_return';
  if (/олиш|получ|быстр|tez|urgent/i.test(query)) return 'speed';
  if (/гибк|flexible|снять|withdraw|erkin/i.test(query)) return 'flexibility';
  if (/дешев|арзон|cheap|низк/i.test(query)) return 'low_cost';
  return 'unknown';
}

function parseAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/\s/g, '').toLowerCase();
  if (cleaned.includes('млн') || cleaned.includes('miln') || cleaned.includes('million')) {
    return parseFloat(cleaned) * 1_000_000;
  }
  const num = parseInt(cleaned.replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? undefined : num;
}

// ─── Main recommendation logic ────────────────────────────────────────────────

export function buildRecommendations(goal: CustomerGoal): RecommendationResult {
  let catalogue: ProductRecommendation[];
  let consultantNote: string;

  switch (goal.type) {
    case 'deposit':
      catalogue = rankDeposits(goal);
      consultantNote = buildDepositNote(goal);
      break;
    case 'loan':
      catalogue = rankLoans(goal);
      consultantNote = buildLoanNote(goal);
      break;
    case 'card':
      catalogue = CARD_CATALOGUE.slice(0, 2);
      consultantNote = '💡 Вы ищете карту для повседневных расчётов, путешествий или онлайн-покупок?';
      break;
    default:
      catalogue = [];
      consultantNote = '💡 Расскажите подробнее о вашей цели — подберу лучшее решение.';
  }

  return {
    goal,
    recommendations: catalogue.slice(0, 3),
    consultantNote,
  };
}

function rankDeposits(goal: CustomerGoal): ProductRecommendation[] {
  const ranked = [...DEPOSIT_CATALOGUE];
  if (goal.priority === 'max_return') {
    return ranked; // DaroMax already #1
  }
  if (goal.priority === 'flexibility') {
    // Put savings account first
    return [DEPOSIT_CATALOGUE[1]!, DEPOSIT_CATALOGUE[0]!, DEPOSIT_CATALOGUE[2]!];
  }
  return ranked;
}

function rankLoans(goal: CustomerGoal): ProductRecommendation[] {
  if (goal.priority === 'speed') return [LOAN_CATALOGUE[0]!, LOAN_CATALOGUE[2]!, LOAN_CATALOGUE[1]!];
  return LOAN_CATALOGUE;
}

function buildDepositNote(goal: CustomerGoal): string {
  if (goal.amountHint) {
    const formatted = goal.amountHint.toLocaleString('ru-RU');
    return `💡 Для суммы ~${formatted} UZS лучший вариант — **DaroMax** (18%). Вы планируете держать средства весь срок или может понадобиться досрочный доступ?`;
  }
  if (goal.priority === 'max_return') {
    return '💡 **DaroMax** — максимальный доход (18%). Какой срок и сумму рассматриваете?';
  }
  return '💡 Какой срок и сумму вклада вы планируете? Это поможет подобрать идеальный вариант.';
}

function buildLoanNote(goal: CustomerGoal): string {
  if (goal.amountHint) {
    return `💡 На сумму ~${goal.amountHint.toLocaleString('ru-RU')} UZS — подберём оптимальный вариант. На какой срок рассматриваете?`;
  }
  return '💡 На какую сумму и срок рассматриваете кредит? Расскажите о цели — подберу лучшее предложение.';
}

// ─── Multilingual rendering ───────────────────────────────────────────────────

export function renderRecommendations(
  result: RecommendationResult,
  lang: string,
): string {
  if (result.recommendations.length === 0) return '';

  const medals = ['🥇', '🥈', '🥉'];
  const headers: Record<string, Record<string, string>> = {
    ru: { deposit: '✨ Подобрал лучшие вклады для вас', loan: '✨ Лучшие кредитные предложения', card: '✨ Подобрал карты для вас' },
    uz: { deposit: '✨ Siz uchun eng yaxshi depozitlar', loan: '✨ Eng yaxshi kredit takliflari', card: '✨ Siz uchun kartalar' },
    en: { deposit: '✨ Best deposit options for you', loan: '✨ Best loan options for you', card: '✨ Card recommendations for you' },
  };

  const header = (headers[lang] ?? headers['ru']!)[result.goal.type] ?? '✨ Rекомендации';
  let md = `${header}\n\n`;

  result.recommendations.forEach((rec, i) => {
    md += `${medals[i] ?? '•'} **${rec.productName}**\n`;
    md += rec.highlights.map(h => `- ${h}`).join('\n') + '\n';
    md += `\n*${rec.bestFor}*\n\n`;
  });

  md += `---\n${result.consultantNote}`;
  return md;
}
