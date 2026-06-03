# Architecture Diagram
## Ipoteka Bank — AI Customer Intelligence Platform
### Техническая архитектура системы

---

## ОБЗОРНАЯ СХЕМА

```
╔══════════════════════════════════════════════════════════════════════════╗
║                         КЛИЕНТСКИЙ УРОВЕНЬ                               ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   ┌─────────────────────────────────────────────────────────────────┐   ║
║   │               САЙТ IPOTEKA BANK                                  │   ║
║   │   ipotekabank.uz / любой домен банка                            │   ║
║   │                                                                 │   ║
║   │   ┌─────────────────────────────────────────────────────────┐  │   ║
║   │   │           AI CHAT WIDGET                                 │  │   ║
║   │   │   React 18 + Vite + Tailwind CSS                        │  │   ║
║   │   │                                                          │  │   ║
║   │   │   • FAB-кнопка (нижний правый угол)                     │  │   ║
║   │   │   • Размер: 400px × 620px (desktop) / fullscreen (mob) │  │   ║
║   │   │   • Языки: 🇺🇿 UZ (латиница) + 🇷🇺 RU                   │  │   ║
║   │   │   • SSE streaming (Server-Sent Events)                  │  │   ║
║   │   │   • Lead Capture Card (+998XXXXXXXXX валидация)         │  │   ║
║   │   │   • Quick Actions (context-aware chips)                 │  │   ║
║   │   │   • Trust footer (банковский дисклеймер)               │  │   ║
║   │   └─────────────────────────────────────────────────────────┘  │   ║
║   └─────────────────────────────────────────────────────────────────┘   ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
                              │ HTTPS / SSE
                              │ JWT (admin routes)
                              ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                         BACKEND УРОВЕНЬ                                  ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   Node.js 20 + Fastify                                                   ║
║   Render.com (auto-deploy from GitHub)                                   ║
║                                                                          ║
║   ┌──────────────────────────────────────────────────────────────────┐  ║
║   │                    MIDDLEWARE СЛОЙ                                │  ║
║   │  CORS · Rate Limiting (20 req/min/IP) · Request ID · JWT Auth   │  ║
║   └──────────────────────────────────────────────────────────────────┘  ║
║                                                                          ║
║   ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────┐  ║
║   │   CHAT ROUTES   │  │  ADMIN ROUTES   │  │   ANALYTICS ROUTES   │  ║
║   │                 │  │                 │  │                      │  ║
║   │ POST /api/chat  │  │ /api/admin/*    │  │ POST /api/analytics  │  ║
║   │ GET  /api/sess. │  │ JWT-protected   │  │ /quick-action        │  ║
║   │ GET  /api/widget│  │ Dashboard KPI   │  │                      │  ║
║   │ POST /api/leads │  │ Conversations   │  │                      │  ║
║   └────────┬────────┘  │ Leads CRM       │  └──────────────────────┘  ║
║            │           │ Complaints      │                              ║
║            │           │ Escalations     │                              ║
║            │           │ AI Insights     │                              ║
║            │           └─────────────────┘                              ║
║            │                                                             ║
║   ┌─────────▼────────────────────────────────────────────────────────┐  ║
║   │                    RAG ДВИЖОК (Retrieval-Augmented Generation)    │  ║
║   │                                                                   │  ║
║   │   Запрос пользователя                                            │  ║
║   │        │                                                          │  ║
║   │        ├──── [1] Embed Query ──────────────────────────────────► │  ║
║   │        │     text-embedding-3-small (OpenAI)                     │  ║
║   │        │                                                          │  ║
║   │        ├──── [2] ПАРАЛЛЕЛЬНО ──────────────────────────────────► │  ║
║   │        │     ├── FAQ lookup (cosine similarity)                  │  ║
║   │        │     ├── KB retrieve (pgvector topK=5, threshold=0.25)  │  ║
║   │        │     └── Intent detection (keyword + vector match)       │  ║
║   │        │                                                          │  ║
║   │        └──── [3] ROUTING DECISION ──────────────────────────►   │  ║
║   │              ┌─────────────────────────────────────────────┐    │  ║
║   │              │ confidence ≥ 0.88 → faq_direct (прямой FAQ) │    │  ║
║   │              │ score ≥ 0.50     → kb_context (KB + LLM)   │    │  ║
║   │              │ score > 0.25     → llm_only (только GPT)   │    │  ║
║   │              │ score < 0.25     → escalate (оператор)     │    │  ║
║   │              └─────────────────────────────────────────────┘    │  ║
║   └──────────────────────────────────────────────────────────────────┘  ║
║                                                                          ║
║   ┌──────────────────────────────────────────────────────────────────┐  ║
║   │                    LEAD INTELLIGENCE ENGINE                       │  ║
║   │                                                                   │  ║
║   │   Детекция интереса → Скоринг 0–100 → CRM (5 этапов)            │  ║
║   │   Типы: callback | consultation | escalation | product_interest  │  ║
║   │   Pipeline: new → contacted → qualified → converted → closed    │  ║
║   │   Транзакции PostgreSQL + история переходов                      │  ║
║   └──────────────────────────────────────────────────────────────────┘  ║
║                                                                          ║
║   ┌──────────────────────────────────────────────────────────────────┐  ║
║   │                 CUSTOMER INTELLIGENCE ENGINE                      │  ║
║   │                                                                   │  ║
║   │   Topic Analysis  → 10+ интентов, тренды vs пред. период         │  ║
║   │   Complaint Detect → 8 категорий, regex-паттерны UZ+RU+EN        │  ║
║   │   Trend Detection  → anomaly если изменение >40%                 │  ║
║   │   Auto-Escalation  → 10+ жалоб/24ч → создаёт эскалацию          │  ║
║   │   AI Insights      → GPT-4o-mini генерирует 5 инсайтов           │  ║
║   └──────────────────────────────────────────────────────────────────┘  ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
                              │
                              ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                           DATA УРОВЕНЬ                                   ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   PostgreSQL 17 + pgvector 0.8.2                                         ║
║   Render.com managed database                                            ║
║                                                                          ║
║   ┌─────────────┐  ┌─────────────┐  ┌────────────────┐               ║
║   │   SESSIONS  │  │  MESSAGES   │  │   KB_CHUNKS    │               ║
║   │  (сессии)   │  │ (переписка) │  │ (База знаний)  │               ║
║   │  tenant_id  │  │  role:      │  │  embedding     │               ║
║   │  lang       │  │  user/asst  │  │  vector(1536)  │               ║
║   │  created_at │  │  content    │  │  faq_entries   │               ║
║   └─────────────┘  │  escalation │  │  intent_entries│               ║
║                    │  _signaled  │  └────────────────┘               ║
║                    └─────────────┘                                      ║
║                                                                          ║
║   ┌─────────────┐  ┌─────────────────┐  ┌──────────────────────────┐ ║
║   │    LEADS    │  │ LEAD_STATUS_    │  │   ANALYTICS_EVENTS       │ ║
║   │  (лиды)     │  │   HISTORY       │  │   (события)              │ ║
║   │  lead_score │  │ (история CRM)   │  │   event_type:            │ ║
║   │  0–100      │  │ from→to status  │  │   chat_turn / faq_hit    │ ║
║   │  status     │  │ timestamp       │  │   escalation             │ ║
║   │  pipeline   │  └─────────────────┘  │   lead_captured          │ ║
║   └─────────────┘                       │   intent_name            │ ║
║                                         └──────────────────────────┘ ║
║                                                                          ║
║   ┌───────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ║
║   │ ADMIN_ESCALATIONS │  │  QUICK_ACTION_   │  │   VOICE_CALLS    │  ║
║   │  (эскалации)      │  │     CLICKS       │  │ (Phase 2 ready)  │  ║
║   │  auto_detected    │  │  (аналитика)     │  │  transcript      │  ║
║   │  trigger_count    │  │  chip_label      │  │  whisper_segments│  ║
║   │  severity         │  │  intent, lang    │  │  classification  │  ║
║   │  open/resolved    │  └──────────────────┘  │  sentiment       │  ║
║   └───────────────────┘                        └──────────────────┘  ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
                              │ API Key
                              ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                           AI / ML УРОВЕНЬ                                ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   ┌─────────────────────────────┐  ┌─────────────────────────────────┐ ║
║   │      GPT-4o-mini            │  │   text-embedding-3-small        │ ║
║   │   (генерация ответов +      │  │   (1536-мерные векторы)         │ ║
║   │    AI insights)             │  │   Поиск по KB (cosine sim.)     │ ║
║   │                             │  │   FAQ matching                  │ ║
║   │   Persona: Премиум Банкир   │  │   Intent detection              │ ║
║   │   Язык-лок: UZ или RU       │  └─────────────────────────────────┘ ║
║   │   Домен-гард: только банк   │                                       ║
║   │   3 шаблона ответов         │                                       ║
║   │   Streaming (SSE)           │                                       ║
║   └─────────────────────────────┘                                       ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
                              │ Browser
                              ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                         ADMIN УРОВЕНЬ                                    ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   React SPA · Vercel CDN · /admin/ route                                 ║
║   Тёмная тема · 100% русский язык · JWT-авторизация                     ║
║                                                                          ║
║   ┌──────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────┐            ║
║   │Dashboard │ │Conversations │ │  Leads   │ │Complaints│            ║
║   │          │ │              │ │          │ │          │            ║
║   │KPI cards │ │Search+filter │ │CRM 5-step│ │8 categ.  │            ║
║   │Lead funnel│ │Message thread│ │Scoring   │ │Severity  │            ║
║   │Volume    │ │Deep-link CRM │ │Timeline  │ │Trends    │            ║
║   │chart     │ │Escalation tag│ │Toast notif│ │Auto-alert│            ║
║   │AI insights│ │              │ │          │ │          │            ║
║   └──────────┘ └──────────────┘ └──────────┘ └──────────┘            ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## ПОТОК ДАННЫХ: ОДИН ДИАЛОГ

```
1. Клиент открывает виджет
   └── Widget → POST /api/session → создаётся session_id в PostgreSQL

2. Клиент вводит сообщение: «Хочу взять ипотеку»
   └── Widget → POST /api/chat { sessionId, message, lang }

3. Backend: параллельная обработка
   ├── embedText() → OpenAI text-embedding-3-small → vector[1536]
   ├── lookupFaq() → cosine similarity vs faq_entries.embedding
   ├── retrieveChunks() → pgvector топ-5 из kb_chunks WHERE lang='ru'
   └── detectIntent() → 'kredit_ariza' / 'ipoteka' matched

4. Routing decision
   └── confidence = 0.72 → 'kb_context' → GPT-4o-mini с контекстом KB

5. LLM генерация (streaming)
   └── SSE events: { type:'delta', content:'...' } × N
   └── SSE event: { type:'done', meta:{ routing_tier, confidence, intent } }

6. Lead detection (в Widget)
   └── /ипотека/i match → setLeadInterest('Ипотека') → показать LeadCaptureCard

7. Клиент вводит телефон +998901234567
   └── Widget → POST /api/leads { phone, fullName, interestType, sessionId, lang }
   └── Backend: computeLeadScore() = 45+15+15 = 75 (WARM)
   └── INSERT INTO leads ... lead_score=75, status='new'

8. Quick Actions (в Widget)
   └── getQuickActions('ipoteka', 0.72, 'ru', 'Хочу взять ипотеку')
   └── PURCHASE_INTENT_RE matches → LEAD_CHIPS показаны
   └── Клиент нажимает «📋 Оставить заявку»
   └── Widget → POST /api/analytics/quick-action → INSERT quick_action_clicks

9. Analytics event записан
   └── INSERT INTO analytics_events { session_id, event_type='chat_turn', intent_name='ipoteka', confidence=0.72 }

10. Admin Dashboard обновится при следующем открытии
    └── GET /api/admin/intelligence/dashboard → aggregated KPIs
    └── Лид виден в /admin/leads с оценкой 75 (WARM♨️)
    └── Диалог виден в /admin/conversations с тегом 👥 (лид)
```

---

## БАЗА ДАННЫХ: 17 МИГРАЦИЙ

```
0000_init.sql          — базовые таблицы
0001_tenants.sql       — мультитенантность
0002_kb_chunks.sql     — база знаний + pgvector
0003_sessions.sql      — сессии клиентов
0004_messages.sql      — переписка
0005_ingestion_jobs.sql — задачи импорта KB
0006_messages_tenant.sql — привязка сообщений к тенанту
0007_ipoteka_knowledge.sql — faq_entries + intent_entries
0008_leads.sql         — захват лидов
0009_analytics_events.sql — события аналитики
0010_customer_context.sql — контекст клиента
0011_ipoteka_origin.sql — настройки для банка
0012_admin_escalations.sql — эскалации + voice_calls (Phase 2)
0013_bank_ai_chat_origin.sql — дополнительные настройки
0014_lead_enhancements.sql — улучшения lead schema
0015_quick_action_analytics.sql — аналитика quick actions
0016_lead_timeline.sql — история CRM + фикс constraints
```

---

## БЕЗОПАСНОСТЬ

```
Уровень 1 — Сеть:
  • HTTPS everywhere
  • CORS: только разрешённые origins (allowedOrigins per tenant)
  • Rate limiting: 20 req/min/IP (global), 30 msg/10min/session (chat)

Уровень 2 — Аутентификация:
  • JWT для admin-панели (истекает, обновляется)
  • Session ID для клиентского чата (UUID, не предсказуемый)

Уровень 3 — Данные:
  • Персональные данные клиентов: только телефон + имя (если предоставил)
  • Никаких паролей, никаких платёжных данных
  • Данные PostgreSQL: шифрование at rest (Render managed)

Уровень 4 — AI:
  • Домен-гард: AI не отвечает на не-банковские вопросы (оба уровня: pre-filter + prompt)
  • Disclamer клиенту: «Ответы носят информационный характер»
  • KB-источники помечены тегами, AI не может следовать инструкциям внутри <source>
```

---

## МАСШТАБИРУЕМОСТЬ

**Текущая архитектура** (один тенант, один сервер):
- Render Starter: 512MB RAM, 0.5 CPU
- Оценка: до ~500 одновременных сессий

**Путь к масштабированию:**
1. Горизонтальное: несколько Render workers (без изменений кода)
2. Multi-tenant: архитектура мультитенантности уже встроена (`tenant_id` в каждой таблице)
3. Read replicas: PostgreSQL read replica для analytics queries
4. Cache: Redis для hot FAQ entries (механизм invalidateFaqCache уже в коде)

---

*Architecture Diagram v1.0 · Ipoteka Bank AI Platform · Июнь 2026*
