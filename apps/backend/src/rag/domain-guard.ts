/**
 * domain-guard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 1 of the banking domain guardrail.
 *
 * Architecture:
 *   1. Fast keyword pre-screen: if banking signals found → ALLOW immediately
 *   2. Off-topic pattern match (EN + RU + UZ)
 *      • Latin patterns: use \b word boundaries
 *      • Cyrillic patterns: separate regex without \b (Cyrillic chars are \W in JS)
 *   3. Any match → BLOCK with localized canned response
 *
 * Called from chat.ts AFTER SSE is open and user message is persisted,
 * BEFORE the expensive orchestrate() / OpenAI call.
 */

// ─── Banking override signals ─────────────────────────────────────────────────
// If ANY of these appear the query is let through regardless of off-topic hits.
// These are common banking words in all three languages (EN/RU/UZ).
const BANKING_SIGNALS_LATIN =
  /\b(depozit|omonat|kredit|ipoteka|ssuda|overdraft|karta|card|visa|mastercard|uzcard|humo|bank|filial|atm|bankomat|kassa|payment|perevod|transfer|hisob|schyot|account|balans|balance|vklad|stavka|foiz|procent|percent|qarz|dolg|loan|mortgage|terminal|swift|iban|valyuta|kurs|currency|exchange|autopay|payroll|debt|cashback|investment|investitsiya|naqd|money|otp|pin|cvv|limit|kapitalizatsiya|kapitallashtirish|foizsiz)\b/i;

// Cyrillic banking keywords (no \b needed — Cyrillic is \W in JS regex)
const BANKING_SIGNALS_CYRILLIC =
  /депозит|вклад|ипотека|кредит|карт|счёт|счет|баланс|перевод|оплат|платеж|банк|банком|банкомат|касс|ставк|процент|долг|займ|валют|курс|наличн|лимит|капитализаци|беспроцент|пополн|инвестиц|зарплат|блокировк|задолженн/i;

function hasBankingSignal(q: string): boolean {
  return BANKING_SIGNALS_LATIN.test(q) || BANKING_SIGNALS_CYRILLIC.test(q);
}

// ─── Off-topic rule interface ─────────────────────────────────────────────────

interface OffTopicRule {
  name: string;
  /** Latin/mixed pattern — uses \b boundaries */
  pattern: RegExp;
  /** Optional Cyrillic pattern — no \b needed */
  cyrillicPattern?: RegExp;
}

// ─── Off-topic rule groups ────────────────────────────────────────────────────

const OFF_TOPIC_RULES: OffTopicRule[] = [
  // ── Programming & tech ───────────────────────────────────────────────────────
  {
    name: 'programming',
    pattern:
      /\b(python|javascript|typescript|java(?!script)\b|c\+\+|c#|php|ruby|golang|rust(?! bank)|kotlin|swift(?! code)|html|css|react|vue|angular|nodejs|django|flask|fastapi|docker|kubernetes|terraform|github|linux|bash|powershell|algorithm|machine learning|neural network|llm|chatgpt|openai|rest api|graphql|postgresql|mongodb|elasticsearch|numpy|pandas|tensorflow|pytorch|data science|deep learning)\b/i,
    cyrillicPattern: /программирован|алгоритм|нейросет|искусственный интеллект/i,
  },
  // ── Medicine & health ────────────────────────────────────────────────────────
  {
    name: 'medicine',
    pattern:
      /\b(diagnoz|diagnos[ie]s|symptom|disease|infect|vaccin|hospital|clinic(?! banking)|shifokor|vrach|doctor(?! bank)|tablet|pill|capsul|ibuprofen|paracetamol|aspirin|analgin|antibiotic|dosage|milligram|\bmg\b|prescription(?! bank)|surgery|diabetes|cancer|headache|fever|vitamin)\b/i,
    cyrillicPattern: /симптом|болезн|лечен|диагноз|диабет|таблетк|капсул|антибиотик|рецепт(?! банк)|хирург|дозировк|витамин|медик|болит|температур|врач(?! банк)/i,
  },
  // ── Politics & government ────────────────────────────────────────────────────
  {
    name: 'politics',
    pattern:
      /\b(president(?! bank)|parliament|senat|congress|hukumat(?! bank)|government(?! bank)|election|saylov|politics|constitution|minister(?! bank))\b/i,
    cyrillicPattern: /президент(?! банк)|парламент|сенат|правительство(?! банк)|выбор[ыа]|политик|конституци|министр(?! банк)|путин|навальн|мирзиёев/i,
  },
  // ── History & geography ──────────────────────────────────────────────────────
  {
    name: 'history_geography',
    pattern:
      /\b(ancient|civilization|war(?!rant)(?! chest)|revolution|empire|geografiya|geography|continent|ocean(?! bank)|capital city|capital of)\b/i,
    cyrillicPattern: /история(?! банк)|историческ|история(?! кредит)|древн|цивилизаци|война(?! за)|революци|империя|география|материк|океан(?! банк)/i,
  },
  // ── Education & courses ──────────────────────────────────────────────────────
  {
    name: 'education',
    pattern:
      /\b(university(?! bank)|oliy o'quv|online course|recommend.*course|course recommendation|data science course|learn(?:ing)? python|learn(?:ing)? javascript|teach me|professor|lektor)\b/i,
    cyrillicPattern: /университет(?! банк)|институт(?! банк)|обучени[ею]|учёб|курсы(?! банк| кредит| процент)|рекоменд.*курс|онлайн курс/i,
  },
  // ── Language learning ────────────────────────────────────────────────────────
  {
    name: 'language_learning',
    pattern:
      /\b(learn english|learn russian|learn uzbek|teach me .{0,20} language|grammar(?! bank)|verb|noun|adjective|translate(?! bank))\b/i,
    cyrillicPattern: /выучить язык|учить язык|изучить язык|грамматик|перевод(?! банк| счет)/i,
  },
  // ── Cooking & food ──────────────────────────────────────────────────────────
  {
    name: 'cooking',
    pattern:
      /\b(recipe|retsept(?! bank)|cook(?:ing)?(?! bank)|bake|burger|pizza|sushi|lagman|ingredient|taomnoma|osh pishir|pishiriladi|taom|ovqat)\b/i,
    cyrillicPattern: /рецепт(?! банк)|приготов|готовит|готовка|блюд[оа]|ингредиент|плов(?! банк)|лагман(?! банк)|борщ|шурп|самса|манты/i,
  },
  // ── Entertainment & sports ──────────────────────────────────────────────────
  {
    name: 'entertainment',
    pattern:
      /\b(movie|cinema|kino(?! bank)|serial|series|music(?! bank)|singer|actor|celebrity|netflix|youtube|sport(?! bank)|football(?! bank)|basketball(?! bank)|tennis(?! bank)|chess|recommend.*film|recommend.*show|recommend.*series|recommend.*movie|recommend.*tv)\b/i,
    cyrillicPattern: /фильм|кино(?! банк)|сериал|музык|певец|актёр|знаменитост|спорт(?! банк)|футбол(?! банк)|баскетбол|шахмат|анекдот|рекоменд.*фильм|рекоменд.*сериал/i,
  },
  // ── Math & science ──────────────────────────────────────────────────────────
  {
    name: 'math_science',
    pattern:
      /\b(integral|derivative|calculus|algebra(?! bank)|geometry|trigonometry|physics(?! bank)|chemistry(?! bank)|biology(?! bank)|atom|molecule|quantum|equation(?! bank)|theorem|proof)\b/i,
    cyrillicPattern: /алгебра|геометри|тригонометри|физика(?! банк)|химия(?! банк)|биологи(?! банк)|интеграл|дифференциал|теорем|молекул|квантов/i,
  },
  // ── Jokes & general off-topic chat ──────────────────────────────────────────
  {
    name: 'general_chat',
    pattern:
      /\b(tell me a joke|write a poem|write a story|write an essay|tell me about yourself(?! bank)|rap battle)\b/i,
    cyrillicPattern: /расскажи анекдот|расскажи шутк|напиши стих|напиши рассказ|напиши эссе|кто ты такой|что ты умеешь(?! в банк)/i,
  },
];

// ─── Localized off-topic responses ───────────────────────────────────────────

const OFF_TOPIC_RESPONSES: Record<string, string> = {
  uz: `Kechirasiz, men faqat bank xizmatlari bo'yicha yordam bera olaman — depozitlar, kreditlar, kartalar, o'tkazmalar va Ipoteka Bank mahsulotlari. Bu mavzu bo'yicha javob bera olmayman.

Sizga qanday bank xizmati kerak? Masalan:
• 💰 Eng foydali depozit tanlash
• 🏠 Kredit yoki ipoteka shartlari
• 💳 Karta rasmiylashtirish
• 📞 Mutaxassis bilan bog'lanish`,

  ru: `Извините, я специализируюсь исключительно на банковских услугах — вкладах, кредитах, картах, переводах и продуктах Ipoteka Bank. По данной теме я не могу помочь.

Чем могу помочь по банковским вопросам?
• 💰 Подобрать выгодный вклад
• 🏠 Условия кредита или ипотеки
• 💳 Оформление карты
• 📞 Связаться со специалистом`,

  en: `I'm sorry, I can only assist with banking services — deposits, loans, cards, transfers, and Ipoteka Bank products. I'm not able to help with that topic.

How can I help you with banking?
• 💰 Find the best deposit
• 🏠 Loan or mortgage terms
• 💳 Get a card
• 📞 Connect with a specialist`,
};

// ─── Public API ───────────────────────────────────────────────────────────────

export interface DomainCheckResult {
  allowed: boolean;
  /** Which rule blocked the query (for logging). Undefined when allowed. */
  blockedBy?: string;
}

/**
 * Checks whether a query is within the banking domain.
 *
 * Algorithm:
 *   1. If the query contains banking signals → allow (fast path).
 *   2. Run all off-topic rules (Latin + optional Cyrillic pattern).
 *   3. If any rule fires → block.
 *   4. Otherwise → allow (default-open for ambiguous queries; LLM DOMAIN_RESTRICTION
 *      section in the system prompt acts as the second guardrail layer).
 */
export function checkDomainRelevance(query: string): DomainCheckResult {
  const q = query.trim();

  // Fast path: strong banking signal → always allow
  if (hasBankingSignal(q)) {
    return { allowed: true };
  }

  // Off-topic scan
  for (const rule of OFF_TOPIC_RULES) {
    if (rule.pattern.test(q) || rule.cyrillicPattern?.test(q)) {
      return { allowed: false, blockedBy: rule.name };
    }
  }

  // No clear off-topic signal → allow (LLM is 2nd layer)
  return { allowed: true };
}

/**
 * Returns a localized, friendly decline message for off-topic queries.
 * Falls back to Russian if the lang key is not found.
 */
export function getOffTopicResponse(lang: string): string {
  return OFF_TOPIC_RESPONSES[lang] ?? OFF_TOPIC_RESPONSES['ru']!;
}
