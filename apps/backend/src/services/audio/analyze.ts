/**
 * VOC Call Analysis Engine
 *
 * Pipeline:
 *   transcript
 *     → [normalizeUzbek]  (only when language='uz')
 *     → analyzeTranscript (GPT JSON classification)
 *
 * Uzbek normalization:
 *   Whisper outputs raw phonetic text for Uzbek even with language='uz'.
 *   A dedicated GPT pass rewrites it into proper literary Uzbek before
 *   classification, so the stored transcript is human-readable.
 */

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type Priority  = 'low' | 'medium' | 'high' | 'critical';

export interface CallAnalysis {
  summary: string;
  sentiment: Sentiment;
  sentimentScore: number;     // 0.0 – 1.0
  category: string;           // Вклады / Кредиты / Ипотека / ...
  subcategory: string;        // AI-generated, e.g. "Vklad 20%"
  priority: Priority;
  topics: string[];
  isLead: boolean;
  leadScore: number;          // 0 – 100
  leadInterest: string;
  isComplaint: boolean;
  complaintNotes: string;
  language: string;
}

// ─── Uzbek normalizer ─────────────────────────────────────────────────────────

/**
 * Post-process a raw Whisper Uzbek transcript into proper literary Uzbek.
 *
 * Whisper with language='uz' produces mostly correct words but with:
 *   - missing punctuation and sentence breaks
 *   - inconsistent apostrophes (o'zbek vs ozbek)
 *   - mixed register
 *
 * This step fixes all of the above while keeping the original meaning intact.
 */
export async function normalizeUzbek(
  rawTranscript: string,
  apiKey: string,
  model = 'gpt-4o-mini',
): Promise<string> {
  if (!rawTranscript || rawTranscript.trim().length < 10) return rawTranscript;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `Siz o'zbek bank qo'ng'iroqlari transkriptlarini tahrirlovchi mutaxassississiz.

Muhim: Kiritilgan matn avtomatik nutqni tanish (Whisper STT) tomonidan yaratilgan va qozog'cha yoki boshqa turkiy tildagi fonetik yozuv bo'lishi mumkin, chunki Whisper o'zbek tilini qozog'cha sifatida taniydi.

Vazifangiz:
1. Matnni to'liq o'qib, bank suhbatining ma'nosini tushunib oling
2. Matnni to'g'ri adabiy o'zbek tiliga tarjima yoki o'tkazing — LOTIN YOZUVIDA
3. Bank kontekstida to'g'ri terminlarni ishlating:
   - kredit, omonat, ipoteka, karta, foiz, muddati, to'lov, filial, ariza
4. Salomlashuvlarni to'g'ri yozing: Assalomu alaykum, Alaykum assalom
5. Har bir yangi gapirayotgan kishi yangi qatordan boshlaydi
6. To'g'ri tinish belgilari qo'ying (nuqta, vergul, savol belgisi)
7. To'g'ri apostroflar: o'zbek, ko'proq, bo'ladi, qanday, ma'lumot, so'm, to'lov
8. MAZMUNNI O'ZGARTIRMANG — faqat til va imlo

Faqat tayyor o'zbek matnini qaytaring. Hech qanday izoh, tarjima eslatmasi yoki qo'shimcha so'z yozmang.`,
        },
        {
          role: 'user',
          content: `Xom transkript (Whisper STT, ehtimol qozog'cha yozuvda):\n\n${rawTranscript.slice(0, 5000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    // Non-critical: return raw transcript if normalization fails
    return rawTranscript;
  }

  const data = await res.json() as {
    choices: [{ message: { content: string } }];
  };

  const normalized = data.choices[0]?.message?.content?.trim() ?? '';
  return normalized.length > 20 ? normalized : rawTranscript;
}

// ─── Classification prompt ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Siz bank qo'ng'iroqlari tahlilchisisiz. Sizga telefon suhbatining transkribi beriladi.
Faqat JSON-obyekt qaytaring, hech qanday tushuntirish bermang.

JSON sxemasi:
{
  "summary": "2-4 jumlali qisqacha xulosa RUSCHA (Rus tilida)",
  "sentiment": "positive" | "neutral" | "negative",
  "sentimentScore": 0.0 dan 1.0 gacha son (1.0 = maksimal ijobiy),
  "category": "Вклады" | "Кредиты" | "Автокредиты" | "Ипотека" | "Карты" | "Мобильное приложение" | "Филиалы" | "Поддержка" | "Брокерские услуги" | "Жалобы" | "Другое",
  "subcategory": "o'zbek yoki rus tilida aniq pastki kategoriya",
  "priority": "low" | "medium" | "high" | "critical",
  "topics": ["mavzu1", "mavzu2", "mavzu3"],
  "isLead": true/false,
  "leadScore": 0-100 butun son,
  "leadInterest": "mahsulot nomi (isLead=true bo'lsa), aks holda bo'sh qator",
  "isComplaint": true/false,
  "complaintNotes": "shikoyat tavsifi (isComplaint=true bo'lsa), aks holda bo'sh qator",
  "language": "uz"
}

Muhim qoidalar:
- summary DOIM ruscha yozilsin (boshqaruv rus tilida ishlaydi)
- category doim ruscha bo'lsin
- subcategory va topics o'zbek yoki rus tilida bo'lishi mumkin
- critical: firibgarlik, karta bloklash, mablag' yo'qolishi
- high: xizmat ko'rsatish shikoyati, texnik muammo
- medium: mahsulot bo'yicha maslahat, qayta qo'ng'iroq so'rovi
- low: umumiy savol
- leadScore 90-100: mijoz to'g'ridan-to'g'ri mahsulot ochmoqchi
- leadScore 70-89: aniq savol bilan qiziqish bildirgan
- FAQAT JSON qaytaring, markdown yo'q`;

const SYSTEM_PROMPT_RU = `Ты — аналитик контакт-центра банка. Тебе дают транскрипт звонка.
Верни строго JSON-объект без каких-либо объяснений.

Схема JSON:
{
  "summary": "краткое резюме 2-4 предложения на русском",
  "sentiment": "positive" | "neutral" | "negative",
  "sentimentScore": число от 0.0 до 1.0 (1.0 = максимально позитивный),
  "category": одна из: "Вклады" | "Кредиты" | "Автокредиты" | "Ипотека" | "Карты" | "Мобильное приложение" | "Филиалы" | "Поддержка" | "Брокерские услуги" | "Жалобы" | "Другое",
  "subcategory": "конкретная подкатегория, генерируй сам",
  "priority": "low" | "medium" | "high" | "critical",
  "topics": ["тема1", "тема2", "тема3"],
  "isLead": true/false,
  "leadScore": целое число 0-100,
  "leadInterest": "название продукта если isLead=true, иначе пустая строка",
  "isComplaint": true/false,
  "complaintNotes": "краткое описание жалобы если isComplaint=true, иначе пустая строка",
  "language": "ru" | "uz" | "en"
}

Правила приоритета:
- critical: жалоба на мошенничество, блокировка карты, потеря средств
- high: жалоба на сервис, техническая проблема, срочный запрос
- medium: консультация по продукту, запрос обратного звонка
- low: общий вопрос, информационный запрос

Правила leadScore:
- 90-100: клиент прямо просит открыть продукт / оставить заявку
- 70-89: явный интерес + конкретный вопрос о продукте
- 50-69: интерес есть, но нет конкретного намерения
- 0-49: нет признаков коммерческого интереса

Отвечай ТОЛЬКО JSON, без markdown, без объяснений.`;

// ─── Main analysis function ───────────────────────────────────────────────────

/**
 * Analyze a call transcript using GPT.
 * Automatically selects the prompt language based on detected language.
 */
export async function analyzeTranscript(
  transcript: string,
  apiKey: string,
  model = 'gpt-4o-mini',
  language?: string,
): Promise<CallAnalysis> {
  if (!transcript || transcript.trim().length < 10) {
    return emptyAnalysis(transcript, language);
  }

  // Use Uzbek-aware prompt when language is Uzbek
  const systemPrompt = language === 'uz' ? SYSTEM_PROMPT : SYSTEM_PROMPT_RU;
  const userContent   = language === 'uz'
    ? `Qo'ng'iroq transkribi:\n\n${transcript.slice(0, 6000)}`
    : `Транскрипт звонка:\n\n${transcript.slice(0, 6000)}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GPT analysis API ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    choices: [{ message: { content: string } }];
  };

  let parsed: Partial<CallAnalysis>;
  try {
    parsed = JSON.parse(data.choices[0]!.message.content) as Partial<CallAnalysis>;
  } catch {
    throw new Error('Failed to parse GPT JSON response');
  }

  return {
    summary:        parsed.summary        ?? 'Анализ недоступен',
    sentiment:      validateSentiment(parsed.sentiment),
    sentimentScore: clamp(parsed.sentimentScore ?? 0.5, 0, 1),
    category:       parsed.category       ?? 'Другое',
    subcategory:    parsed.subcategory    ?? '',
    priority:       validatePriority(parsed.priority),
    topics:         Array.isArray(parsed.topics) ? parsed.topics.slice(0, 8) : [],
    isLead:         parsed.isLead         ?? false,
    leadScore:      clamp(parsed.leadScore ?? 0, 0, 100),
    leadInterest:   parsed.leadInterest   ?? '',
    isComplaint:    parsed.isComplaint    ?? false,
    complaintNotes: parsed.complaintNotes ?? '',
    language:       language ?? (parsed.language ?? 'ru'),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyAnalysis(transcript: string, language?: string): CallAnalysis {
  return {
    summary:        transcript.length < 10
      ? 'Транскрипт пустой или слишком короткий для анализа.'
      : 'Анализ недоступен.',
    sentiment:      'neutral',
    sentimentScore: 0.5,
    category:       'Другое',
    subcategory:    '',
    priority:       'low',
    topics:         [],
    isLead:         false,
    leadScore:      0,
    leadInterest:   '',
    isComplaint:    false,
    complaintNotes: '',
    language:       language ?? 'ru',
  };
}

function validateSentiment(v: unknown): Sentiment {
  if (v === 'positive' || v === 'neutral' || v === 'negative') return v;
  return 'neutral';
}

function validatePriority(v: unknown): Priority {
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'critical') return v;
  return 'medium';
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(Number.isFinite(n) ? n : min, min), max);
}
