# Knowledge Architecture — Ipoteka Bank AI Platform

> Phase 2 of 14 · Generated 2026-06-01

---

## 1. Overview

The platform uses a **five-layer knowledge pipeline**: ingestion → normalisation → embedding → retrieval → generation. Every user message flows through all layers in under 800 ms (p95), using cached hot paths for common queries.

```
User message
      │
      ▼
┌─────────────────────────────────────────────┐
│  1. Language detection & normalisation      │
│     Uzbek Cyrillic → Latin, synonym expand  │
└──────────────────┬──────────────────────────┘
                   │
      ┌────────────┼───────────────┐
      ▼            ▼               ▼
  FAQ cache    Intent cache    OpenAI Embed
  (in-memory)  (in-memory)    text-emb-3-sm
      │            │               │
      ▼            ▼               ▼
 Fuzzy + KW    Token F1        pgvector
 BM25 score    score           cosine ≤=>
      │            │               │
      └────────────┴───────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │  Orchestrator   │  ← confidence routing
         │  routing tiers  │
         └────────┬────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
        ▼                    ▼
 faq_direct            kb_context
 (≥ 0.88 conf)         (≥ 0.50 conf)
        │                    │
        └──────┬─────────────┘
               │
               ▼
      System prompt build
      (banking safety rules +
       intent section +
       KB/FAQ context)
               │
               ▼
     gpt-4o-mini SSE stream
               │
               ▼
     Widget (SSE delta events)
```

---

## 2. Knowledge Source Files

### 2.1 `faq_dataset.json`

- **400 Q&A pairs** covering deposits, credits, cards, mobile banking, exchange rates, account services
- Each entry: `{ faq_id, category, question, answer, keywords[], frequency, score }`
- Stored in `faq_entries` table with 1536-dim embeddings

### 2.2 `intents.json`

- **22 intent definitions** spanning all major banking request types
- Each entry: `{ intent_id, name, display_name_uz, display_name_ru, category, example_questions[], keywords[] }`
- Intent INT_022 (`boshqa_savol`) is a catch-all — only used as fallback when confidence < 0.4
- Stored in `intent_entries` table

### 2.3 `canonical_kb_v2.jsonl`

- **1,410 topic entries** — authoritative policy and product documentation
- Each entry: `{ id, title, content, answer, category, frequency, confidence, alternative_questions[] }`
- Language determined from paired `rag_dataset_v2.jsonl` entry (same array index)
- Stored in `kb_chunks` table

### 2.4 `rag_dataset_v2.jsonl`

- **1,410 rows** — search-optimised versions of KB entries
- Each entry: `{ id, title, search_text, language, category }`
- `language` values: `"uzbek"` → `"uz"`, `"russian"` → `"ru"`, `"mixed"` → `"uz"`
- `search_text` is used as the embedding target (better retrieval than raw `content`)

---

## 3. Ingestion Pipeline (`scripts/ingest-ipoteka.ts`)

```
Step 1: Load canonical_kb_v2.jsonl + rag_dataset_v2.jsonl (by index)
Step 2: Map language field from RAG dataset
Step 3: Batch embed in groups of 50 (500ms inter-batch delay)
        Model: text-embedding-3-small, 1536 dims
Step 4: Upsert to kb_chunks
        ON CONFLICT (tenant_id, chunk_id) DO UPDATE
        Updates: title, content, answer, lang, category,
                 frequency, kb_confidence, alt_questions, embedding

Step 5: Load faq_dataset.json
Step 6: Batch embed FAQ questions (same batching strategy)
Step 7: Upsert to faq_entries

Step 8: Load intents.json
Step 9: Extract keywords from example_questions (no API calls needed)
Step 10: Upsert to intent_entries
```

**Re-ingestion is safe**: all upserts use `ON CONFLICT ... DO UPDATE`, so the pipeline is idempotent. Run again at any time to refresh data.

**CLI options:**
```bash
npm run ingest:ipoteka                          # full run
npm run ingest:ipoteka -- --skip-embeddings     # schema-only, no API calls
npm run ingest:ipoteka -- --tenant my-tenant    # different tenant
```

---

## 4. Retrieval Architecture

### 4.1 FAQ Engine (`rag/faq-engine.ts`)

Uses an in-memory cache populated lazily on first query per tenant.

**Lookup algorithm:**
1. Normalise query: Cyrillic→Latin transliteration + synonym expansion
2. Exact/near-exact match check (normalised string equality)
3. Keyword BM25 score: `hits / totalTokens` weighted by `frequency`
4. Vector cosine similarity: `1 - (embedding <=> queryEmbedding)`
5. Combined confidence: `0.45 × keywordScore + 0.55 × vectorSim`
6. Return top match if confidence ≥ threshold (default 0.45)

### 4.2 Intent Engine (`rag/intent-engine.ts`)

Uses an in-memory cache populated lazily on first query per tenant.

**Detection algorithm:**
1. Exact normalised match against `example_questions` → confidence 0.95
2. Token F1 score: harmonic mean of precision and recall on token sets
3. INT_022 (catch-all) excluded from main scoring, applied as fallback (0.35) if best < 0.4

### 4.3 Vector Retrieval (`rag/retrieve.ts`)

**Query:**
```sql
SELECT id, chunk_id, title, content, answer, category,
       COALESCE(frequency, 1) AS frequency,
       1 - (embedding <=> $1::vector) AS cosine_score
FROM kb_chunks
WHERE tenant_id = $2 AND lang = $3
  AND embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT max(topK * 2, 20)
```

**Hybrid re-ranking:**
```
kwScore    = matched_tokens / total_query_tokens
freqBoost  = min(1.15, 1 + log1p(frequency - 1) × 0.03)
finalScore = (0.65 × cosineScore + 0.35 × kwScore) × freqBoost
```

Filter: `finalScore ≥ threshold (default 0.25)`, return top `topK (default 5)`.

---

## 5. Orchestration & Routing (`rag/orchestrator.ts`)

A single `orchestrate(tenant, message, forcedLang?)` call:

1. Detect language (or use forced lang)
2. Normalise text, expand synonyms
3. Embed query once (reused by all layers)
4. **Parallel**: `lookupFaq` + `retrieveChunks` + `detectIntent`
5. Route by confidence tier:

| Tier | Condition | Behaviour |
|---|---|---|
| `faq_direct` | FAQ conf ≥ 0.88 | Answer from FAQ, minimal LLM call |
| `kb_context` | KB score ≥ 0.50 **or** FAQ conf ≥ 0.60 | LLM with KB/FAQ context |
| `llm_only` | Best score 0.25–0.50 | LLM with weak context or none |
| `escalate` | All scores < 0.25 | Escalate to human, no LLM call |

---

## 6. Prompt Engineering (`rag/prompt.ts`)

The system prompt has four sections:

### Section 1 — Role and language
```
You are a helpful, accurate banking assistant for {bankName}.
Always respond in {lang}. Never switch languages mid-response.
```

### Section 2 — Banking safety rules
```
CRITICAL BANKING SAFETY RULES:
1. Never invent interest rates, fees, or loan terms.
2. Never state specific processing times unless from KB.
3. If unsure, say "Please contact our hotline: {supportPhone}".
4. Do not speculate about regulatory or legal matters.
```

### Section 3 — Intent context (when detected)
```
User intent detected: {displayName} ({category})
```

### Section 4 — Knowledge context
- **FAQ hit**: Direct answer block with confidence indicator
- **KB chunks**: Up to 5 chunks, using `answer` field when available, otherwise `content`

---

## 7. Multilingual Design

### Language detection
- Script analysis: Cyrillic characters → Russian or Uzbek Cyrillic
- Uzbek Cyrillic heuristics: ў, қ, ғ, ҳ, ҷ, ҳ characters
- Latin + characteristic Uzbek patterns → Uzbek Latin
- Fallback to tenant default language

### Uzbek Cyrillic → Latin transliteration (from `lang/normalize.ts`)

| Cyrillic | Latin |
|---|---|
| А а | A a |
| Б б | B b |
| В в | V v |
| Г г | G g |
| Ғ ғ | G' g' |
| Д д | D d |
| Е е | Ye ye |
| Ж ж | J j |
| З з | Z z |
| И и | I i |
| Й й | Y y |
| К к | K k |
| Қ қ | Q q |
| Л л | L l |
| М м | M m |
| Н н | N n |
| О о | O o |
| Ў ў | O' o' |
| П п | P p |
| Р р | R r |
| С с | S s |
| Т т | T t |
| У у | U u |
| Ў ў | O' o' |
| Х х | X x |
| Ҳ ҳ | H h |
| Ч ч | Ch ch |
| Ш ш | Sh sh |
| Ъ ъ | ' |
| Э э | E e |
| Ю ю | Yu yu |
| Я я | Ya ya |
| Ц ц | Ts ts |
| Щ щ | Shch shch |

### Banking synonym expansion

Cross-language term normalisation ensures queries in any script find the same KB entries:

| Term group |
|---|
| kredit / кредит / credit / qarz |
| karta / карта / card |
| depozit / депозит / deposit / omonat |
| ipoteka / ипотека / mortgage / uy-joy krediti |
| foiz / процент / stavka / ставка / rate |
| to'lov / платёж / payment / оплата |
| hisob / счёт / account |
| valyuta / валюта / currency |

---

## 8. Caching Strategy

| Cache | Location | Invalidation | Scope |
|---|---|---|---|
| FAQ entries | In-memory Map (per tenant) | `POST /api/admin/cache/invalidate` | Per process |
| Intent entries | In-memory Map (per tenant) | Same | Per process |
| Tenant config | In-memory (tenant loader) | Process restart | Per process |

> **Note**: For horizontally-scaled deployments, replace in-memory caches with Redis and publish cache-invalidation events via pub/sub.
