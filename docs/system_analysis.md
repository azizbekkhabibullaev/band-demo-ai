# System Analysis — Ipoteka Bank AI Platform

> Phase 1 of 14 · Generated 2026-06-01

---

## 1. Project Overview

The Ipoteka Bank AI Platform is a multi-tenant, production-grade banking chatbot built on top of the `bank-chatbot-master` monorepo. It integrates Ipoteka Bank's real knowledge assets (FAQ, intent catalogue, canonical KB, RAG dataset) into a Fastify/Node.js backend with vector-augmented retrieval, returning streaming AI responses over SSE.

---

## 2. Repository Structure

```
bank-chatbot-master/
├── apps/
│   ├── backend/          # Fastify API server (TypeScript ESM)
│   │   ├── src/
│   │   │   ├── db/       # PostgreSQL client, migrations, queries
│   │   │   ├── lang/     # Text normalisation, transliteration, synonyms
│   │   │   ├── lib/      # Shared utilities
│   │   │   ├── llm/      # OpenAI chat client (SSE streaming)
│   │   │   ├── middleware/# CORS origin guard, rate limiting, request-ID
│   │   │   ├── observability/ # Logging / metrics stubs
│   │   │   ├── rag/      # FAQ, intent, retrieval, orchestration, prompt
│   │   │   ├── routes/   # HTTP route handlers
│   │   │   ├── tenants/  # Tenant config loader (YAML)
│   │   │   └── server.ts # Fastify entry point
│   │   └── .env          # DATABASE_URL, OPENAI_API_KEY, etc.
│   └── widget/           # React/Vite chat widget
│       └── src/
│           ├── api/      # client.ts — SSE stream, session, config
│           ├── components/ # ChatWidget, Header, MessageList, InputBar
│           ├── hooks/    # useChat, useWidgetConfig
│           └── types.ts  # Re-exports from @bank-chatbot/shared
├── packages/
│   └── shared/           # Zod schemas, shared TypeScript types
├── tools/
│   └── tenant-sync/      # CLI: sync tenant YAML → DB
├── scripts/
│   ├── ingest-ipoteka.ts # Full KB / FAQ / intent ingestion pipeline
│   ├── seed-demo.ts      # Demo tenant seeding
│   └── embed-kb.ts       # Generic KB embedding helper
├── kb/
│   └── ipoteka-bank/
│       └── _config.yaml  # Ipoteka Bank tenant configuration
└── docs/                 # Architecture & operations documentation
```

---

## 3. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | ≥ 20 (LTS) |
| Language | TypeScript | 5.5 |
| Build tool | tsx (ts-node successor) | 4.x |
| HTTP framework | Fastify | 4.x |
| Database | PostgreSQL | 17 |
| Vector extension | pgvector | 0.8.2 |
| DB driver | pg (node-postgres) | 8.x |
| AI models | OpenAI gpt-4o-mini + text-embedding-3-small | — |
| Frontend | React 18 + Vite + Tailwind CSS | — |
| Package manager | npm workspaces | — |

---

## 4. Database Schema

### Core tables (pre-existing)

| Table | Purpose |
|---|---|
| `tenants` | Per-tenant config and YAML payload |
| `kb_chunks` | Knowledge base entries with pgvector embeddings |
| `sessions` | Chat session registry |
| `messages` | Per-session message log |
| `ingestion_jobs` | Ingestion audit trail |

### Extended by migration `0007_ipoteka_knowledge.sql`

**`kb_chunks` — new columns:**

| Column | Type | Purpose |
|---|---|---|
| `answer` | `text` | Canonical direct answer (from KB) |
| `frequency` | `int` | Query-frequency weight for ranking boost |
| `kb_confidence` | `float` | Source confidence rating (0–1) |
| `alt_questions` | `text[]` | Alternative phrasings for matching |

**`faq_entries` (new table):**

| Column | Type | Purpose |
|---|---|---|
| `faq_id` | `text` | Stable source ID |
| `tenant_id` | `text` | FK → tenants |
| `category` | `text` | Domain category |
| `question` | `text` | Canonical question text |
| `answer` | `text` | Full answer text |
| `keywords` | `text[]` | Extracted keyword tokens |
| `frequency` | `int` | Observed query frequency |
| `score` | `float` | Composite relevance score |
| `embedding` | `vector(1536)` | OpenAI embedding for semantic search |

**`intent_entries` (new table):**

| Column | Type | Purpose |
|---|---|---|
| `intent_id` | `text` | Stable source ID (e.g. INT_001) |
| `name` | `text` | Machine-readable name |
| `display_name_uz` | `text` | Uzbek display label |
| `display_name_ru` | `text` | Russian display label |
| `category` | `text` | Intent category |
| `example_questions` | `text[]` | Training examples (multilingual) |
| `keywords` | `text[]` | Extracted keyword set |
| `kb_count` | `int` | Linked KB entry count |

---

## 5. Knowledge Assets (Ipoteka Bank)

| Asset | File | Entries | Languages |
|---|---|---|---|
| FAQ dataset | `faq_dataset.json` | 400 Q&A pairs | uz, ru |
| Intent catalogue | `intents.json` | 22 intents | uz, ru |
| Canonical KB | `canonical_kb_v2.jsonl` | 1,410 topics | uz (741), ru (616), mixed (53) |
| RAG dataset | `rag_dataset_v2.jsonl` | 1,410 rows | — (language metadata source) |
| Embedding dataset | `embedding_dataset.jsonl` | — | pre-computed (for reference) |

**Current DB state (ipoteka-bank tenant):**

```
kb_chunks : 794 uz + 616 ru = 1,410 (100 % embedded)
faq_entries: 400 (100 % embedded)
intent_entries: 22
```

---

## 6. API Surface

### Public endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness probe |
| `GET` | `/api/widget-config/:tenantId` | Widget bootstrap config |
| `POST` | `/api/session/new` | Create chat session |
| `POST` | `/api/chat` | SSE streaming chat |

### Admin endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/kb/search` | Full-text KB search |
| `GET` | `/api/admin/faq` | FAQ browse / search |
| `GET` | `/api/admin/intents` | List all intents |
| `GET` | `/api/admin/stats` | Tenant stats (KB, FAQ, intents, sessions) |
| `POST` | `/api/admin/cache/invalidate` | Flush in-memory caches |

---

## 7. Security Controls

| Control | Implementation |
|---|---|
| Origin guard | `originPlugin` — checks `Origin` header against tenant `allowedOrigins` |
| Rate limiting | `rateLimitPlugin` — per-IP token bucket (configurable per tenant) |
| Request IDs | `requestIdPlugin` — UUID injected on every request |
| Body limit | Fastify `bodyLimit: 8 KB` |
| Session isolation | Session lookup enforces `tenant_id` match |
| Banking safety | Prompt-level rules: never invent rates, fees, or policy details |
| IP hashing | `IP_HASH_SALT` env var for anonymised rate limiting |

---

## 8. Multi-Tenancy

Each tenant is defined by a YAML file under `kb/<tenant-id>/_config.yaml`. The `tenant-sync` CLI tool (`npm run tenant:sync`) reads these files and upserts rows in the `tenants` table. Every DB table uses `tenant_id` as a partition key — no data leaks between tenants.

---

## 9. Known Limitations

1. **No authentication on admin routes** — `/api/admin/*` is currently unprotected. Add API key or JWT middleware before exposing to the network.
2. **In-memory caches** — FAQ and intent caches are process-local; a multi-instance deployment needs a shared cache layer (Redis).
3. **Single embedding model** — `text-embedding-3-small` (1536-dim) is used everywhere. Upgrading to `text-embedding-3-large` requires re-embedding all 1,810 vectors.
4. **No conversation summarisation** — very long sessions degrade prompt quality. Sliding window or summary compression should be added.
5. **Widget is SPA-only** — no server-side rendering; initial load requires JS.
