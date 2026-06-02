CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kb_chunks (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lang         text         NOT NULL,
  source_file  text         NOT NULL,
  chunk_id     text         NOT NULL,
  category     text         NOT NULL,
  title        text         NOT NULL,
  content      text         NOT NULL,
  embedding    vector(1536) NOT NULL,
  tokens       int          NOT NULL,
  content_hash text         NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, lang, chunk_id),
  CHECK (lang IN ('uz', 'ru', 'en'))
);

CREATE INDEX kb_chunks_tenant_lang ON kb_chunks (tenant_id, lang);

COMMENT ON TABLE  kb_chunks IS 'Vector-searchable knowledge base chunks per tenant.';
COMMENT ON COLUMN kb_chunks.embedding IS 'OpenAI text-embedding-3-small (1536 dims).';
COMMENT ON COLUMN kb_chunks.content_hash IS 'sha256 of content; skip re-embed if unchanged.';
-- HNSW index added when total chunks > ~50k:
--   CREATE INDEX kb_chunks_embedding_hnsw ON kb_chunks USING hnsw (embedding vector_cosine_ops);
