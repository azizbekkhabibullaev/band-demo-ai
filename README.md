# Bank Chatbot

Multi-tenant AI banking assistant. RAG over hand-curated KB. UZ/RU/EN.

See `docs/superpowers/specs/2026-05-25-bank-chatbot-design.md` (in the parent repo) for the full design spec.

## Prerequisites

- **Node.js ≥ 20** — `node --version`
- **Docker** — for Postgres + pgvector
- **OpenAI API key** — optional; without it the backend runs in stub mode (no real LLM calls, no real embeddings)

---

## First-time setup

### 1. Start the database

```bash
docker compose -f infra/docker-compose.yml up -d
```

Starts `bank-chatbot-pg` on port **5433** (avoids conflicts with any local Postgres).

### 2. Install dependencies

```bash
npm install
```

### 3. Apply database migrations

```bash
npm run -w apps/backend migrate
```

Creates all tables (`tenants`, `kb_chunks`, `sessions`, `messages`, etc.) and the pgvector extension.

### 4. Create a `.env` file for the backend

```bash
cat > apps/backend/.env <<'EOF'
DATABASE_URL=postgres://chatbot:chatbot@localhost:5433/chatbot
OPENAI_API_KEY=sk-...        # paste your key here; omit to run without real LLM calls
IP_HASH_SALT=change-me-in-prod
EOF
```

### 5. Seed the demo tenant

```bash
npm run seed:demo
```

Upserts the `demo-bank` tenant (reads `kb/demo-bank/_config.yaml`) and inserts 15 KB chunks with placeholder embeddings.

### 6. Generate real embeddings (optional but recommended)

Requires `OPENAI_API_KEY` to be set in `apps/backend/.env`.

```bash
OPENAI_API_KEY=sk-... npm run embed:kb
```

Replaces placeholder embeddings with real `text-embedding-3-small` vectors so RAG retrieval works properly.

---

## Running the app

Open **two terminals** from the repo root.

**Terminal 1 — backend** (port 3000):

```bash
npm run dev
```

**Terminal 2 — chat widget** (port 5173):

```bash
npm run dev:widget
```

Open **http://localhost:5173** in a browser. You should see a mock bank landing page with a green chat button in the bottom-right corner.

---

## How it works

| Component | URL | What it does |
|-----------|-----|--------------|
| Backend (Fastify) | `http://localhost:3000` | REST + SSE API, RAG pipeline, OpenAI streaming |
| Widget (Vite) | `http://localhost:5173` | React chat widget embedded in a demo bank page |

The Vite dev server proxies all `/api/*` requests to the backend, rewriting the `Origin` header to `http://localhost:3000` so the backend's CORS check passes without any DB changes.

---

## Useful commands

```bash
# Run all backend tests
npm test

# Type-check everything
npm run typecheck

# Sync tenant config from kb/<tenant>/_config.yaml to the DB
npm run tenant:sync -- --tenant demo-bank

# Re-embed KB chunks after editing content
OPENAI_API_KEY=sk-... npm run embed:kb -- --tenant demo-bank

# Embed with a different model
OPENAI_API_KEY=sk-... npm run embed:kb -- --tenant demo-bank --model text-embedding-3-large
```

---

## Troubleshooting

**Widget shows no chat button / console shows 404 on `/api/widget-config/demo-bank`**

The tenant's `allowed_origins` in the DB may be stale. Re-run the seed and restart the backend:

```bash
npm run seed:demo
# then restart Terminal 1 (Ctrl-C, npm run dev)
```

**`EADDRINUSE: address already in use 0.0.0.0:3000`**

Another process is already running the backend. Kill it:

```bash
pkill -f "tsx watch src/server.ts"
```

**OpenAI calls fail / embeddings are all zeros**

Check that `OPENAI_API_KEY` is set in `apps/backend/.env` and starts with `sk-`. Without a key the backend runs in stub mode and KB retrieval falls back to keyword-only scoring.
