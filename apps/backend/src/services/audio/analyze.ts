/**
 * VOC Call Analysis Engine
 *
 * Takes a call transcript and produces structured business intelligence:
 *   - AI summary (3-4 sentences, Russian)
 *   - Sentiment: positive / neutral / negative
 *   - Main category + subcategory
 *   - Priority: low / medium / high / critical
 *   - Lead detection (is_lead + score + interest)
 *   - Complaint detection
 *   - Topics array
 */

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type Priority  = 'low' | 'medium' | 'high' | 'critical';

export interface CallAnalysis {
  summary: string;
  sentiment: Sentiment;
  sentimentScore: number;     // 0.0 – 1.0
  category: string;           // Вклады / Кредиты / Ипотека / ...
  subcategory: string;        // AI-generated, e.g. "Вклад 20%"
  priority: Priority;
  topics: string[];
  isLead: boolean;
  leadScore: number;          // 0 – 100
  leadInterest: string;       // e.g. "Автокредит"
  isComplaint: boolean;
  complaintNotes: string;     // brief description if complaint
  language: string;
}

const SYSTEM_PROMPT = `Ты — аналитик контакт-центра банка. Тебе дают транскрипт звонка.
Верни строго JSON-объект без каких-либо объяснений.

Схема JSON:
{
  "summary": "краткое резюме 2-4 предложения на русском",
  "sentiment": "positive" | "neutral" | "negative",
  "sentimentScore": число от 0.0 до 1.0 (1.0 = максимально позитивный),
  "category": одна из: "Вклады" | "Кредиты" | "Автокредиты" | "Ипотека" | "Карты" | "Мобильное приложение" | "Филиалы" | "Поддержка" | "Брокерские услуги" | "Жалобы" | "Другое",
  "subcategory": "конкретная подкатегория на русском, генерируй сам",
  "priority": "low" | "medium" | "high" | "critical",
  "topics": ["тема1", "тема2", "тема3"],
  "isLead": true/false,
  "leadScore": целое число 0-100 (насколько горячий лид),
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

/**
 * Analyze a call transcript using GPT.
 * Returns structured CallAnalysis or throws on API error.
 */
export async function analyzeTranscript(
  transcript: string,
  apiKey: string,
  model = 'gpt-4o-mini',
): Promise<CallAnalysis> {
  if (!transcript || transcript.trim().length < 10) {
    return emptyAnalysis(transcript);
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Транскрипт звонка:\n\n${transcript.slice(0, 6000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 600,
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
    language:       parsed.language       ?? 'ru',
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function emptyAnalysis(transcript: string): CallAnalysis {
  return {
    summary:        transcript.length < 10 ? 'Транскрипт пустой или слишком короткий для анализа.' : 'Анализ недоступен.',
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
    language:       'ru',
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
