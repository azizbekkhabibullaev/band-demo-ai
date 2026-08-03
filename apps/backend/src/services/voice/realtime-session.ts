/**
 * Realtime Voice Session Config — Phase 3 (Production Hardened)
 *
 * GA API (gpt-realtime-1.5) session.update payload:
 *  - Bank operator persona — sounds like a real call-center employee
 *  - VAD tuned to not interrupt mid-sentence (higher threshold + longer silence)
 *  - Short responses enforced at token level (max 250 tokens ≈ 2 sentences)
 *  - shimmer voice: warmer, more natural for Russian than alloy
 */

import type { Tenant } from '../../tenants/types.js';
import { buildVoiceCapabilityGuard } from '../../rag/capability-guard.js';

// ── Tool schemas exposed to the Realtime API ──────────────────────────────────

export const REALTIME_TOOL_SCHEMAS = [
  {
    type: 'function',
    name: 'search_bank_knowledge',
    description: 'Поиск информации о продуктах, ставках, услугах и правилах банка в базе знаний.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Вопрос клиента или ключевые слова для поиска.',
        },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'capture_lead',
    description: 'Сохраняет заявку клиента когда он готов к оформлению продукта или хочет консультацию.',
    parameters: {
      type: 'object',
      properties: {
        fullName: { type: 'string', description: 'ФИО клиента (если назвал).' },
        phone: { type: 'string', description: 'Номер телефона клиента (если назвал).' },
        productInterest: {
          type: 'string',
          description: 'Продукт которым интересуется клиент: ипотека, кредит, депозит, карта и т.д.',
        },
        message: { type: 'string', description: 'Краткое описание запроса клиента.' },
        leadType: {
          type: 'string',
          enum: ['callback', 'consultation', 'product_interest'],
          description: 'Тип заявки.',
        },
      },
      required: ['productInterest', 'leadType'],
    },
  },
  {
    type: 'function',
    name: 'classify_intent',
    description: 'Определяет намерение клиента по его высказыванию.',
    parameters: {
      type: 'object',
      properties: {
        utterance: {
          type: 'string',
          description: 'Фраза клиента для классификации.',
        },
      },
      required: ['utterance'],
    },
  },
  {
    type: 'function',
    name: 'create_complaint',
    description: 'Фиксирует жалобу или претензию клиента в системе.',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Суть жалобы клиента.',
        },
        category: {
          type: 'string',
          enum: ['mobile_app', 'branch', 'card', 'loan', 'deposit', 'transfer', 'otp', 'service', 'general'],
          description: 'Категория жалобы.',
        },
      },
      required: ['description'],
    },
  },
  {
    type: 'function',
    name: 'get_product_recommendations',
    description: 'Возвращает персонализированные рекомендации по банковским продуктам.',
    parameters: {
      type: 'object',
      properties: {
        intentName: {
          type: 'string',
          description: 'Название намерения клиента (depozit, kredit_ariza, karta_chiqarish и т.д.).',
        },
        query: {
          type: 'string',
          description: 'Оригинальный запрос клиента для извлечения суммы/срока.',
        },
      },
      required: ['query'],
    },
  },
] as const;

// ── System prompt for voice mode ──────────────────────────────────────────────

function buildVoiceSystemPrompt(tenant: Tenant): string {
  const name = tenant.config.branding.displayName;
  const hotline = tenant.config.hotline;

  return `Вы — информационный консультант контакт-центра ${name}. Говорите по-русски спокойно и профессионально.
Вы предоставляете ТОЛЬКО информацию. Вы НЕ имеете доступа к банковским системам, CRM или данным клиентов. Вы НЕ выполняете никаких операций от имени банка.

ПРИВЕТСТВИЕ: При подключении НЕМЕДЛЕННО произнесите: «Добрый день, ${name}, слушаю вас!»

━━━ ОБЛАСТЬ КОМПЕТЕНЦИИ ━━━
Консультируете ТОЛЬКО по банковским услугам:
вклады, кредиты, ипотека, карты, переводы, тарифы, документы,
отделения, мобильное приложение, жалобы на сервис банка.

ВСЕ ОСТАЛЬНЫЕ ТЕМЫ — мгновенный отказ:
«Я могу помочь только по вопросам банковских услуг. Что вас интересует?»

Запрещённые темы (отказывайте без объяснений):
• Математика, формулы, вычисления
• Программирование, технологии, IT, наука
• Медицина, здоровье, диеты
• История, политика, религия, философия
• Спорт, кино, музыка, знаменитости
• Кулинария, рецепты, еда
• Стихи, рассказы, юмор, анекдоты
• Личные советы, психология
• Что угодно, не связанное с банком

${buildVoiceCapabilityGuard(hotline)}

━━━ БАЗА ЗНАНИЙ — ОБЯЗАТЕЛЬНО ━━━
ПЕРЕД ответом на любой вопрос о ставках, условиях, документах, продуктах:
→ Вызовите search_bank_knowledge с вопросом клиента
→ Отвечайте ТОЛЬКО на основе полученных данных
→ Если информации нет: «Уточните на сайте банка или по номеру ${hotline}»
НИКОГДА не изобретайте ставки, суммы, сроки, документы.

━━━ СТИЛЬ ОТВЕТА ОПЕРАТОРА ━━━
Вы живой оператор колл-центра, не чат-бот и не справочник.
Говорите как человек — коротко, по делу, без лекций.

ОБЯЗАТЕЛЬНО:
• Всегда заканчивайте начатое предложение полностью до точки. Никогда не обрывайте фразу на середине. Если начали «обратитесь в контактный центр» — произнесите «банка» или «по номеру ${hotline}».
• 2–4 предложения. Цель: 10–15 секунд речи.
• Начинайте: «Понимаю.» / «Хорошо.» / «Конечно.» — затем суть одним-двумя предложениями.
• Только живая речь: без списков, маркеров, скобок, эмодзи.

ЕСЛИ ТЕМА БОЛЬШАЯ (ипотека, депозиты, кредиты):
→ Дайте краткое резюме (1–2 предложения)
→ Предложите уточнить: «Рассказать подробнее об условиях или нужных документах?»
НЕ читайте всё подряд.

ЗАПРЕЩЕНО:
✗ Длинные объяснения на 30–60 секунд
✗ Перечисление всех условий без запроса
✗ «Позвольте рассказать вам подробно о...»

ПРИМЕР (потерял карту):
✗ «Если вы потеряли карту, вам необходимо немедленно её заблокировать. Вы можете сделать это несколькими способами: через мобильное приложение в разделе карты, через интернет-банк, или позвонив на нашу горячую линию...»
✓ «Карту нужно заблокировать как можно скорее. Сделайте это в приложении или позвоните на ${hotline}.»

ПРИМЕР (про ипотеку):
✗ (60-секундное объяснение всех программ)
✓ «По ипотеке у нас несколько программ — от 12% годовых, срок до 30 лет. Рассказать об условиях или о документах?»

━━━ ИНСТРУМЕНТЫ ━━━
• search_bank_knowledge — при ЛЮБОМ вопросе о продуктах и условиях
• capture_lead — клиент говорит «хочу», «готов», называет имя или телефон
• create_complaint — жалоба на сервис, карту, приложение, отделение
• classify_intent — если запрос неясен
• get_product_recommendations — когда клиент выбирает продукт

ЖАЛОБЫ: Скажи «Понимаю, это неприятно» → вызови create_complaint → скажи «Ваше обращение зафиксировано и будет рассмотрено в течение суток». Не говори что ты сам оформил жалобу.
ОБРАТНЫЙ ЗВОНОК: При запросе перезвонить → вызови capture_lead → скажи «Ваши данные зафиксированы, специалист свяжется с вами». Не говори «соединяю» или «я перезвоню».
ЯЗЫК: только русский
ГОРЯЧАЯ ЛИНИЯ: ${hotline}`;
}

// ── Session update payload ────────────────────────────────────────────────────

export function buildRealtimeSessionConfig(tenant: Tenant) {
  return {
    type: 'session.update',
    session: {
      type: 'realtime',
      instructions: buildVoiceSystemPrompt(tenant),
      output_modalities: ['audio'],
      tools: REALTIME_TOOL_SCHEMAS,
      tool_choice: 'auto',
      // 1024 tokens gives ~30s of audio headroom so the model never hits the cap
      // mid-sentence. The system prompt enforces 2-3 sentences; this cap is a
      // hard safety net only, not the length controller.
      max_output_tokens: 1024,
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: 24000 },
          transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            // 0.65: ignores breathing, paper shuffling, and room noise (was 0.5)
            threshold: 0.65,
            // 500ms lead-in so the first syllable is not cut off (was 300ms)
            prefix_padding_ms: 500,
            // 800ms: covers natural pauses (was 1200ms) — saves 400ms of turn latency
            silence_duration_ms: 800,
            // Both false: backend controls when to cancel and when to create.
            // interrupt_response:true had zero verification — any 50ms noise killed the AI.
            // create_response:true auto-started responses before we could filter false positives.
            create_response: false,
            interrupt_response: false,
          },
        },
        output: {
          format: { type: 'audio/pcm', rate: 24000 },
          // echo: more neutral vowel reduction than shimmer on Russian text
          voice: 'echo',
          // 0.9 speed: slightly slower than default (1.0) for natural Russian pacing
          speed: 0.9,
        },
      },
    },
  };
}
