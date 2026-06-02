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
  lang?: string;
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

// ─── Uzbek product catalogues ────────────────────────────────────────────────

const DEPOSIT_CATALOGUE_UZ: ProductRecommendation[] = [
  {
    rank: 1,
    productId: 'daromax-24',
    productName: 'DaroMax',
    tagline: 'Maksimal daromad — eng yaxshi muddatli depozit',
    highlights: [
      '📈 Stavka: yiliga 18%',
      '⏳ Muddat: 24 oy',
      '💰 Minimum: 500 000 UZS',
      '🔒 Butun muddat uchun qat\'iy stavka',
    ],
    bestFor: 'Maqsad — maksimal daromad va pul muddatdan oldin kerak bo\'lmasa',
    ctaLabel: 'DaroMax rasmiylashtirish',
  },
  {
    rank: 2,
    productId: 'savings-account',
    productName: 'Jamg\'arma hisobi',
    tagline: 'Moslashuvchanlik + faol jamg\'arish uchun daromad',
    highlights: [
      '📈 Stavka: yiliga 14% gacha',
      '✅ Istalgan vaqtda to\'ldirish',
      '✅ Foizni yo\'qotmasdan qisman yechib olish',
      '💰 Minimum: 15 000 000 UZS',
    ],
    bestFor: 'Yaxshi stavka bilan pul boshqarishda erkinlik kerak bo\'lsa',
    ctaLabel: 'Jamg\'arma hisobini ochish',
  },
  {
    rank: 3,
    productId: 'demand-deposit',
    productName: 'Talab bo\'yicha depozit',
    tagline: 'Tezkor kirish bilan xavfsiz saqlash',
    highlights: [
      '⚡ Istalgan vaqtda yechib olish',
      '🔄 Operatsiyalarga cheklov yo\'q',
      '💰 Minimum: 100 000 UZS',
      '🛡️ Davlat tomonidan sug\'urtalangan',
    ],
    bestFor: 'Pul istalgan vaqtda kerak bo\'lishi mumkin bo\'lsa',
    ctaLabel: 'Depozit ochish',
  },
];

const LOAN_CATALOGUE_UZ: ProductRecommendation[] = [
  {
    rank: 1,
    productId: 'consumer-loan',
    productName: 'Iste\'mol krediti',
    tagline: 'Har qanday maqsad uchun tezkor yechim',
    highlights: [
      '⚡ 1 kunda qaror',
      '📋 Minimal hujjatlar',
      '💳 Kartaga o\'tkazish',
      '📅 Muddat: 36 oygacha',
    ],
    bestFor: 'Garovsiz xaridlar va shaxsiy ehtiyojlar uchun',
    ctaLabel: 'Ariza topshirish',
  },
  {
    rank: 2,
    productId: 'mortgage',
    productName: 'Ipoteka',
    tagline: 'O\'z uyingizga yo\'l',
    highlights: [
      '🏠 Birlamchi va ikkilamchi bozorda uy sotib olish',
      '📅 Muddat: 25 yilgacha',
      '💰 Boshlang\'ich to\'lov: 20% dan',
      '🤝 Davlat dasturlari',
    ],
    bestFor: 'Uzoq muddatli rejalashtirish bilan ko\'chmas mulk sotib olish uchun',
    ctaLabel: 'Ipotekani hisoblash',
  },
  {
    rank: 3,
    productId: 'car-loan',
    productName: 'Avtokredit',
    tagline: 'Bugun o\'z mashinangiz rulida',
    highlights: [
      '🚗 Yangi va ishlatilgan avtomobillar',
      '📅 Muddat: 60 oygacha',
      '⚡ Tezkor rasmiylashtirish',
      '💰 Minimal boshlang\'ich to\'lov',
    ],
    bestFor: 'Qulay oylik to\'lovlar bilan avtomobil sotib olish uchun',
    ctaLabel: 'Avtokreditni rasmiylashtirish',
  },
];

const CARD_CATALOGUE_UZ: ProductRecommendation[] = [
  {
    rank: 1,
    productId: 'uzcard-classic',
    productName: 'UzCard Classic',
    tagline: 'Kundalik hisob-kitoblar uchun asosiy karta',
    highlights: [
      '🛒 Istalgan do\'konda to\'lov',
      '💳 Mashhur kategoriyalarda keshbek',
      '📱 Mobil ilovaga ulangan',
      '🔄 Bank mijozlari o\'rtasida bepul o\'tkazmalar',
    ],
    bestFor: 'Kundalik xaridlar va xizmatlar uchun',
    ctaLabel: 'Karta rasmiylashtirish',
  },
  {
    rank: 2,
    productId: 'visa-gold',
    productName: 'Visa Gold',
    tagline: 'Kengaytirilgan imkoniyatlar bilan premium karta',
    highlights: [
      '🌍 Xorijda to\'lov',
      '💎 Oshirilgan keshbek',
      '🛡️ Sayohat sug\'urtasi',
      '🏦 Konsyerj xizmat',
    ],
    bestFor: 'Sayohat va valyutadagi onlayn xaridlar uchun',
    ctaLabel: 'Visa Gold rasmiylashtirish',
  },
];

// ─── Goal extraction from conversation context ────────────────────────────────

const AMOUNT_PATTERN = /(\d[\d\s]*(?:000|млн|miln|million))/gi;
const TERM_PATTERN   = /(\d+)\s*(?:месяц|mese|month|yil|год|year|oy)/gi;

export function extractGoal(
  intentName: string | null,
  query: string,
  lang = 'ru',
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

  return { type, priority, amountHint: amountHint ?? undefined, termMonths: termMonths ?? undefined, currency, lang };
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
  const isUz = (goal.lang ?? 'ru') === 'uz';
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
      catalogue = (isUz ? CARD_CATALOGUE_UZ : CARD_CATALOGUE).slice(0, 2);
      consultantNote = isUz
        ? '💡 Kundalik hisob-kitoblar, sayohat yoki onlayn xaridlar uchun karta izlayapsizmi?'
        : '💡 Вы ищете карту для повседневных расчётов, путешествий или онлайн-покупок?';
      break;
    default:
      catalogue = [];
      consultantNote = isUz
        ? '💡 Maqsadingiz haqida ko\'proq ayting — eng yaxshi yechimni tanlab beraman.'
        : '💡 Расскажите подробнее о вашей цели — подберу лучшее решение.';
  }

  return {
    goal,
    recommendations: catalogue.slice(0, 3),
    consultantNote,
  };
}

function rankDeposits(goal: CustomerGoal): ProductRecommendation[] {
  const cat = (goal.lang ?? 'ru') === 'uz' ? DEPOSIT_CATALOGUE_UZ : DEPOSIT_CATALOGUE;
  const ranked = [...cat];
  if (goal.priority === 'max_return') {
    return ranked; // DaroMax already #1
  }
  if (goal.priority === 'flexibility') {
    // Put savings account first
    return [cat[1]!, cat[0]!, cat[2]!];
  }
  return ranked;
}

function rankLoans(goal: CustomerGoal): ProductRecommendation[] {
  const cat = (goal.lang ?? 'ru') === 'uz' ? LOAN_CATALOGUE_UZ : LOAN_CATALOGUE;
  if (goal.priority === 'speed') return [cat[0]!, cat[2]!, cat[1]!];
  return cat;
}

function buildDepositNote(goal: CustomerGoal): string {
  const isUz = (goal.lang ?? 'ru') === 'uz';
  if (goal.amountHint) {
    const formatted = goal.amountHint.toLocaleString('ru-RU');
    return isUz
      ? `💡 ~${formatted} UZS summasi uchun eng yaxshi variant — **DaroMax** (18%). Pul butun muddat turishini rejalashtiryapsizmi yoki muddatdan oldin kerak bo'lishi mumkinmi?`
      : `💡 Для суммы ~${formatted} UZS лучший вариант — **DaroMax** (18%). Вы планируете держать средства весь срок или может понадобиться досрочный доступ?`;
  }
  if (goal.priority === 'max_return') {
    return isUz
      ? '💡 **DaroMax** — maksimal daromad (18%). Qanday muddat va summani ko\'rib chiqayapsiz?'
      : '💡 **DaroMax** — максимальный доход (18%). Какой срок и сумму рассматриваете?';
  }
  return isUz
    ? '💡 Qanday muddat va summada depozit ochishni rejalashtiryapsiz? Bu ideal variant tanlashga yordam beradi.'
    : '💡 Какой срок и сумму вклада вы планируете? Это поможет подобрать идеальный вариант.';
}

function buildLoanNote(goal: CustomerGoal): string {
  const isUz = (goal.lang ?? 'ru') === 'uz';
  if (goal.amountHint) {
    const formatted = goal.amountHint.toLocaleString('ru-RU');
    return isUz
      ? `💡 ~${formatted} UZS summasi uchun — optimal variant tanlaymiz. Qanday muddatni ko'rib chiqayapsiz?`
      : `💡 На сумму ~${formatted} UZS — подберём оптимальный вариант. На какой срок рассматриваете?`;
  }
  return isUz
    ? '💡 Kredit summasi va muddati qancha bo\'lishini aytib bering — eng yaxshi taklifni tanlab beraman.'
    : '💡 На какую сумму и срок рассматриваете кредит? Расскажите о цели — подберу лучшее предложение.';
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
