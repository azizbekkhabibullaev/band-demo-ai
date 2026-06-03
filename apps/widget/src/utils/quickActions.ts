/**
 * Context-Aware Quick Action Engine
 *
 * Converts detected intent + confidence into 0-3 relevant chip actions.
 * Rules:
 *   - confidence < 0.8 → no chips (unless strong purchase intent in user message)
 *   - intent = boshqa_savol | undefined → no chips
 *   - strong purchase intent detected → lead-gen chips override
 *   - otherwise → intent-specific informational chips
 */

export interface QuickAction {
  icon:  string;
  label: string;   // Full display text including emoji
  query: string;   // Message sent when chip is clicked
  type:  'info' | 'lead';
}

// ─── Intent → chip map ────────────────────────────────────────────────────────

const CHIPS: Record<string, Record<string, QuickAction[]>> = {
  // Branch / location
  filial: {
    ru: [
      { icon: '📍', label: '📍 Другие филиалы',         query: 'Покажите адреса всех филиалов Ipoteka Bank',  type: 'info' },
      { icon: '🕒', label: '🕒 График работы',           query: 'Какой график работы отделений?',              type: 'info' },
      { icon: '📞', label: '📞 Связаться с оператором',  query: 'Соедините меня с оператором',                 type: 'info' },
    ],
    uz: [
      { icon: '📍', label: "📍 Boshqa filiallar",        query: "Ipoteka Bank barcha filiallari manzillarini ko'rsating", type: 'info' },
      { icon: '🕒', label: '🕒 Ish vaqti',               query: "Filiallar ish vaqti qanday?",                 type: 'info' },
      { icon: '📞', label: "📞 Operator bilan bog'lanish", query: "Operator bilan bog'lanmoqchiman",           type: 'info' },
    ],
  },

  // Deposit
  depozit: {
    ru: [
      { icon: '📈', label: '📈 Текущие ставки',     query: 'Какие сейчас ставки по вкладам?',              type: 'info' },
      { icon: '💵', label: '💵 Минимальная сумма',   query: 'Какая минимальная сумма для открытия вклада?', type: 'info' },
      { icon: '📞', label: '📞 Консультация',         query: 'Хочу открыть вклад, нужна консультация',      type: 'lead' },
    ],
    uz: [
      { icon: '📈', label: '📈 Foiz stavkalari',      query: "Hozirgi depozit foiz stavkalari qanday?",      type: 'info' },
      { icon: '💵', label: '💵 Minimal summa',         query: "Depozit ochish uchun minimal summa qancha?",   type: 'info' },
      { icon: '📞', label: "📞 Mutaxassis bilan aloqa", query: "Depozit ochmoqchiman, maslahat kerak",       type: 'lead' },
    ],
  },

  // Loan
  kredit_ariza: {
    ru: [
      { icon: '💰', label: '💰 Рассчитать платёж',  query: 'Рассчитайте ежемесячный платёж по кредиту',    type: 'info' },
      { icon: '📋', label: '📋 Документы',            query: 'Какие документы нужны для получения кредита?', type: 'info' },
      { icon: '📞', label: '📞 Специалист',           query: 'Хочу взять кредит, свяжите меня со специалистом', type: 'lead' },
    ],
    uz: [
      { icon: '💰', label: "💰 To'lovni hisoblash",   query: "Kredit bo'yicha oylik to'lovni hisoblang",     type: 'info' },
      { icon: '📋', label: '📋 Hujjatlar',             query: "Kredit olish uchun qanday hujjatlar kerak?",   type: 'info' },
      { icon: '📞', label: '📞 Mutaxassis',            query: "Kredit olmoqchiman, mutaxassis bilan bog'lanay", type: 'lead' },
    ],
  },

  // Loan holiday / restructuring — same UX as loan
  kredit_tatil: {
    ru: [
      { icon: '💰', label: '💰 Условия отсрочки',     query: 'Каковы условия кредитных каникул?',            type: 'info' },
      { icon: '📋', label: '📋 Документы',             query: 'Какие документы нужны для реструктуризации?',  type: 'info' },
      { icon: '📞', label: '📞 Специалист',            query: 'Хочу оформить кредитные каникулы',             type: 'lead' },
    ],
    uz: [
      { icon: '💰', label: "💰 Muhlat shartlari",      query: "Kredit ta'tillari shartlari qanday?",          type: 'info' },
      { icon: '📋', label: '📋 Hujjatlar',              query: "Qayta tuzish uchun qanday hujjatlar kerak?",   type: 'info' },
      { icon: '📞', label: '📞 Mutaxassis',             query: "Kredit ta'tilini rasmiylashtirmoqchiman",      type: 'lead' },
    ],
  },

  // Mortgage (ipoteka) — treated as a separate intent by keyword fallback
  ipoteka: {
    ru: [
      { icon: '🏠', label: '🏠 Первоначальный взнос',  query: 'Каков минимальный первоначальный взнос по ипотеке?', type: 'info' },
      { icon: '💰', label: '💰 Платёж в месяц',        query: 'Рассчитайте ежемесячный платёж по ипотеке',           type: 'info' },
      { icon: '📋', label: '📋 Документы',               query: 'Какие документы нужны для ипотеки?',                  type: 'info' },
    ],
    uz: [
      { icon: '🏠', label: "🏠 Boshlang'ich badal",     query: "Ipoteka bo'yicha minimal boshlang'ich badal qancha?", type: 'info' },
      { icon: '💰', label: "💰 Oylik to'lov",            query: "Ipoteka bo'yicha oylik to'lovni hisoblang",           type: 'info' },
      { icon: '📋', label: '📋 Hujjatlar',               query: "Ipoteka uchun qanday hujjatlar kerak?",               type: 'info' },
    ],
  },

  // Card
  karta_chiqarish: {
    ru: [
      { icon: '💳', label: '💳 Тарифы',                 query: 'Какие тарифы по картам Ipoteka Bank?',          type: 'info' },
      { icon: '🔒', label: '🔒 Блокировка карты',        query: 'Как заблокировать карту?',                     type: 'info' },
      { icon: '📞', label: '📞 Поддержка',               query: 'Нужна помощь по карте',                        type: 'info' },
    ],
    uz: [
      { icon: '💳', label: '💳 Tariflar',                query: "Ipoteka Bank kartalarining tariflari qanday?",  type: 'info' },
      { icon: '🔒', label: '🔒 Kartani bloklash',        query: "Kartani qanday bloklash mumkin?",               type: 'info' },
      { icon: '📞', label: '📞 Yordam',                  query: "Karta bo'yicha yordam kerak",                  type: 'info' },
    ],
  },

  // Account opening — same UX as card
  hisob_ochish: {
    ru: [
      { icon: '💳', label: '💳 Виды счетов',             query: 'Какие виды счетов можно открыть?',             type: 'info' },
      { icon: '📋', label: '📋 Документы',               query: 'Что нужно для открытия счёта?',                type: 'info' },
      { icon: '📞', label: '📞 Специалист',              query: 'Хочу открыть счёт, свяжите со специалистом',   type: 'lead' },
    ],
    uz: [
      { icon: '💳', label: "💳 Hisob turlari",           query: "Qanday hisob turlarini ochish mumkin?",        type: 'info' },
      { icon: '📋', label: '📋 Hujjatlar',               query: "Hisob ochish uchun nima kerak?",               type: 'info' },
      { icon: '📞', label: '📞 Mutaxassis',              query: "Hisob ochmoqchiman, mutaxassis bilan bog'lanay", type: 'lead' },
    ],
  },

  // Mobile banking
  mobile_bank: {
    ru: [
      { icon: '📱', label: '📱 Частые ошибки',          query: 'Какие частые ошибки в мобильном приложении?', type: 'info' },
      { icon: '🔄', label: '🔄 Переустановить',          query: 'Как переустановить мобильное приложение?',    type: 'info' },
      { icon: '📞', label: '📞 Техподдержка',            query: 'Нужна техническая поддержка по приложению',   type: 'info' },
    ],
    uz: [
      { icon: '📱', label: "📱 Ommabop muammolar",       query: "Mobil ilovada qanday ommabop muammolar bor?",  type: 'info' },
      { icon: '🔄', label: "🔄 Qayta o'rnatish",          query: "Mobil ilovani qayta o'rnatish qanday?",        type: 'info' },
      { icon: '📞', label: '📞 Texnik yordam',            query: "Ilova bo'yicha texnik yordam kerak",           type: 'info' },
    ],
  },

  // Transfer
  o_tkazma: {
    ru: [
      { icon: '↔️', label: '↔️ Лимиты переводов',       query: 'Каковы лимиты на переводы?',                  type: 'info' },
      { icon: '💱', label: '💱 Комиссии',                query: 'Какая комиссия за переводы?',                  type: 'info' },
      { icon: '📞', label: '📞 Поддержка',               query: 'Нужна помощь по переводу средств',             type: 'info' },
    ],
    uz: [
      { icon: '↔️', label: "↔️ O'tkazma limitlari",     query: "O'tkazmalar bo'yicha limitlar qanday?",        type: 'info' },
      { icon: '💱', label: '💱 Komissiya',               query: "O'tkazma uchun qancha komissiya olinadi?",     type: 'info' },
      { icon: '📞', label: '📞 Yordam',                  query: "Pul o'tkazish bo'yicha yordam kerak",          type: 'info' },
    ],
  },

  // Complaint
  shikoyat: {
    ru: [
      { icon: '📝', label: '📝 Создать обращение',       query: 'Как создать официальное обращение в банк?',    type: 'info' },
      { icon: '📞', label: '📞 Связаться с оператором',  query: 'Соедините меня с оператором',                  type: 'info' },
      { icon: '🏢', label: '🏢 Ближайший офис',          query: 'Где находится ближайший офис банка?',           type: 'info' },
    ],
    uz: [
      { icon: '📝', label: "📝 Murojaat yaratish",       query: "Bankga rasmiy murojaat qanday yaratiladi?",    type: 'info' },
      { icon: '📞', label: "📞 Operator bilan aloqa",    query: "Operator bilan bog'lanmoqchiman",              type: 'info' },
      { icon: '🏢', label: '🏢 Eng yaqin filial',        query: "Eng yaqin bank filiali qayerda?",              type: 'info' },
    ],
  },
};

// ─── Lead-generation override chips ─────────────────────────────────────────
const LEAD_CHIPS: Record<string, QuickAction[]> = {
  ru: [
    { icon: '📞', label: '📞 Заказать звонок',              query: 'Хочу, чтобы специалист мне перезвонил',          type: 'lead' },
    { icon: '👤', label: '👤 Консультация специалиста',      query: 'Хочу получить консультацию специалиста',         type: 'lead' },
    { icon: '📋', label: '📋 Оставить заявку',               query: 'Хочу оставить заявку на продукт',                type: 'lead' },
  ],
  uz: [
    { icon: '📞', label: "📞 Qo'ng'iroq buyurtma qilish",   query: "Mutaxassis menga qo'ng'iroq qilsin",             type: 'lead' },
    { icon: '👤', label: '👤 Mutaxassis maslahati',          query: 'Mutaxassisdan maslahat olmoqchiman',              type: 'lead' },
    { icon: '📋', label: '📋 Ariza qoldirish',               query: "Mahsulot bo'yicha ariza qoldirmoqchiman",        type: 'lead' },
  ],
};

// ─── Purchase intent detection ───────────────────────────────────────────────
const PURCHASE_INTENT_RE =
  /\b(хочу|хотел|хотела|нужен|нужна|нужно|оформить|взять|открыть|подать|заявку|нужна консультация|интересует|планирую|собираюсь)\b/i;
const PURCHASE_INTENT_UZ =
  /\b(xohlayman|kerak|olmoqchi|ochmoqchi|rasmiylashtirmoqchi|ariza|murojaat|qoldirmoqchi|rejalashtiryapman)\b/i;

// Intents that are product-related (purchase intent amplifies them)
const PRODUCT_INTENTS = new Set([
  'depozit', 'kredit_ariza', 'kredit_tatil', 'karta_chiqarish',
  'hisob_ochish', 'ipoteka',
]);

// Intents where chips make no business sense
const NO_CHIP_INTENTS = new Set(['boshqa_savol', 'domain_guard']);

// ─── Mortgage keyword fallback (backend might not have a distinct ipoteka intent) ──
function looksLikeMortgage(text: string): boolean {
  return /ипотека|ipoteka/i.test(text);
}

function looksLikeComplaint(text: string): boolean {
  return /жалоб|претензи|недовол|shikoyat|norozilik|muammo.*yomon|yomon.*xizmat/i.test(text);
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export function getQuickActions(
  intent:          string | undefined,
  confidence:      number | undefined,
  lang:            string,
  lastUserMessage: string,
): QuickAction[] {
  const l = lang === 'uz' ? 'uz' : 'ru';

  // Resolve the effective intent, with keyword fallbacks
  let effectiveIntent = intent;
  if (looksLikeMortgage(lastUserMessage)) effectiveIntent = 'ipoteka';
  if (looksLikeComplaint(lastUserMessage)) effectiveIntent = 'shikoyat';

  // Never show chips for catch-all / unknown intents
  if (!effectiveIntent || NO_CHIP_INTENTS.has(effectiveIntent)) return [];

  // Confidence gate — skip only when no strong product signal in user message
  const hasPurchaseIntent =
    PURCHASE_INTENT_RE.test(lastUserMessage) || PURCHASE_INTENT_UZ.test(lastUserMessage);

  if ((confidence === undefined || confidence < 0.8) && !hasPurchaseIntent) return [];

  // Strong purchase intent for a known product → lead-gen chips
  if (hasPurchaseIntent && PRODUCT_INTENTS.has(effectiveIntent)) {
    return LEAD_CHIPS[l] ?? [];
  }

  // Intent-specific informational chips
  const chips = CHIPS[effectiveIntent]?.[l];
  return chips ?? [];
}
