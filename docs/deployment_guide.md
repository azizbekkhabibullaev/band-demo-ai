# Deployment Guide — Ipoteka Bank AI Platform

> Phase 13 of 14 · Generated 2026-06-01

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 LTS | Use nvm: `nvm install 20 && nvm use 20` |
| PostgreSQL | 17 | pgvector must be compiled for the same major version |
| pgvector | 0.8.2+ | `CREATE EXTENSION IF NOT EXISTS vector` |
| npm | 10+ | Bundled with Node 20 |
| OpenAI API key | — | `text-embedding-3-small` + `gpt-4o-mini` access required |

---

## 2. First-Time Setup

### 2.1 Clone and install dependencies

```bash
git clone <repo-url> bank-chatbot-master
cd bank-chatbot-master
npm install
```

### 2.2 Configure environment

Create `apps/backend/.env`:

```dotenv
# PostgreSQL connection string
DATABASE_URL=postgres://<user>:<password>@<host>:5432/<dbname>

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Security
IP_HASH_SALT=change-me-in-prod-use-a-long-random-string

# Server
PORT=3000
```

> Never commit `.env` to version control. Use a secrets manager in production (AWS Secrets Manager, HashiCorp Vault, etc.).

### 2.3 Create the database

```bash
# Connect as superuser
psql -U postgres

CREATE USER chatbot WITH PASSWORD 'chatbot';
CREATE DATABASE chatbot OWNER chatbot;
\c chatbot
CREATE EXTENSION IF NOT EXISTS vector;
\q
```

### 2.4 Run migrations

```bash
npm run -w apps/backend migrate
```

This applies all `.sql` files in `apps/backend/src/db/migrations/` in lexicographic order.

### 2.5 Sync tenant configuration

```bash
npm run tenant:sync -- --tenant ipoteka-bank
```

This reads `kb/ipoteka-bank/_config.yaml` and upserts the tenant row in the database.

### 2.6 Ingest knowledge assets

Place the raw knowledge files in the path expected by the ingest script:

```
<base-path>/
├── canonical_kb_v2.jsonl
├── rag_dataset_v2.jsonl
├── faq_dataset.json
└── intents.json
```

Then run:

```bash
npm run ingest:ipoteka
```

This will:
- Embed 1,410 KB chunks via OpenAI (~41 seconds for initial run)
- Embed 400 FAQ entries
- Index 22 intents (no API calls)
- Print progress and final counts

To do a dry run without API calls:

```bash
npm run ingest:ipoteka -- --skip-embeddings
```

### 2.7 Start servers

**Backend:**
```bash
npm run dev
# → Backend listening on http://localhost:3000
```

**Widget (development):**
```bash
npm run dev:widget
# → Widget dev server at http://localhost:5173
```

---

## 3. Production Build

### 3.1 Build the widget

```bash
npm run build:widget
```

Output: `apps/widget/dist/` — static files ready to serve.

### 3.2 Run backend in production

The backend runs directly via `tsx` (no separate compile step needed):

```bash
NODE_ENV=production npm run start -w apps/backend
```

Or with a process manager:

```bash
# With PM2
pm2 start "npm run start -w apps/backend" --name ipoteka-bank-api

# With systemd (see section 5)
```

---

## 4. Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `OPENAI_API_KEY` | Yes | — | OpenAI API key |
| `IP_HASH_SALT` | Yes | `change-me-in-prod` | Salt for IP anonymisation in rate limiting |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | Set to `production` in prod |

Widget build-time variables (in `apps/widget/.env` or CI):

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `""` (relative) | Backend base URL for production deployments |
| `VITE_TENANT_ID` | `ipoteka-bank` | Active tenant ID |

---

## 5. systemd Service (Linux)

Create `/etc/systemd/system/ipoteka-bank-api.service`:

```ini
[Unit]
Description=Ipoteka Bank AI API
After=network.target postgresql.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/bank-chatbot-master
ExecStart=/usr/local/bin/node --import tsx/esm apps/backend/src/server.ts
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
EnvironmentFile=/opt/bank-chatbot-master/apps/backend/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable ipoteka-bank-api
sudo systemctl start ipoteka-bank-api
sudo journalctl -u ipoteka-bank-api -f
```

---

## 6. Nginx Reverse Proxy

```nginx
upstream ipoteka_api {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name api.ipotekabank.uz;

    ssl_certificate     /etc/ssl/certs/ipotekabank.crt;
    ssl_certificate_key /etc/ssl/private/ipotekabank.key;

    # SSE requires disabling buffering
    location /api/chat {
        proxy_pass         http://ipoteka_api;
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 120s;
    }

    location /api/ {
        proxy_pass       http://ipoteka_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        root   /var/www/ipotekabank-widget;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name api.ipotekabank.uz;
    return 301 https://$host$request_uri;
}
```

---

## 7. Docker Compose (Optional)

```yaml
version: '3.9'

services:
  postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_USER: chatbot
      POSTGRES_PASSWORD: chatbot
      POSTGRES_DB: chatbot
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chatbot"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    environment:
      DATABASE_URL: postgres://chatbot:chatbot@postgres:5432/chatbot
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      IP_HASH_SALT: ${IP_HASH_SALT}
      PORT: 3000
      NODE_ENV: production
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    restart: on-failure

volumes:
  pgdata:
```

Create `apps/backend/Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY packages/ ./packages/
RUN npm ci --workspace=apps/backend --workspace=packages/shared
COPY apps/backend/ ./apps/backend/
COPY packages/ ./packages/
EXPOSE 3000
CMD ["npx", "tsx", "apps/backend/src/server.ts"]
```

---

## 8. Database Maintenance

### Re-run migrations (safe — all are idempotent)
```bash
npm run -w apps/backend migrate
```

### Re-ingest knowledge assets
```bash
npm run ingest:ipoteka
```
All upserts use `ON CONFLICT ... DO UPDATE` — safe to run repeatedly.

### Invalidate caches after data update
```bash
curl -X POST "http://localhost:3000/api/admin/cache/invalidate?tenant=ipoteka-bank"
```

### Vacuum the vector index periodically
```sql
VACUUM ANALYZE kb_chunks;
VACUUM ANALYZE faq_entries;
```

---

## 9. Health Check & Monitoring

```bash
# Liveness
curl http://localhost:3000/api/health
# → {"status":"ok","uptime_seconds":1234,"version":"0.1.0"}

# Tenant stats
curl "http://localhost:3000/api/admin/stats?tenant=ipoteka-bank"
```

Recommended alerting thresholds:
- Response time p95 > 2s → investigate embedding latency or DB query plans
- `escalate` routing tier > 15 % of queries → KB coverage gap
- Error rate > 1 % → check OpenAI API status

---

## 10. Security Checklist for Production

- [ ] `IP_HASH_SALT` set to a 32+ character random string
- [ ] `allowedOrigins` in `_config.yaml` updated to production domain(s)
- [ ] Admin routes (`/api/admin/*`) protected behind API key or VPN
- [ ] `.env` not committed; secrets loaded from secrets manager
- [ ] TLS termination at load balancer or Nginx
- [ ] Rate limits tuned for production traffic
- [ ] PostgreSQL not exposed on public network interface
- [ ] Regular DB backups configured
- [ ] OpenAI API key scoped to minimum required permissions
