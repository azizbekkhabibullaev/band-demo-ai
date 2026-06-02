-- Migration 0007: Extend kb_chunks and add FAQ/intent tables for Ipoteka Bank knowledge base

-- Extend kb_chunks with answer and metadata columns
ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS answer text;
ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS frequency int NOT NULL DEFAULT 1;
ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS kb_confidence float NOT NULL DEFAULT 0.5;
ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS alt_questions text[] NOT NULL DEFAULT '{}';

-- FAQ entries table
CREATE TABLE IF NOT EXISTS faq_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  faq_id      text NOT NULL,
  kb_id       text,
  category    text NOT NULL,
  question    text NOT NULL,
  answer      text NOT NULL,
  keywords    text[] NOT NULL DEFAULT '{}',
  frequency   int NOT NULL DEFAULT 1,
  score       float NOT NULL DEFAULT 0,
  embedding   vector(1536),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, faq_id)
);

CREATE INDEX IF NOT EXISTS faq_entries_tenant ON faq_entries (tenant_id);

-- Intent entries table
CREATE TABLE IF NOT EXISTS intent_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intent_id        text NOT NULL,
  name             text NOT NULL,
  display_name_uz  text NOT NULL,
  display_name_ru  text NOT NULL,
  category         text NOT NULL,
  example_questions text[] NOT NULL DEFAULT '{}',
  keywords         text[] NOT NULL DEFAULT '{}',
  kb_count         int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, intent_id)
);

CREATE INDEX IF NOT EXISTS intent_entries_tenant ON intent_entries (tenant_id);
