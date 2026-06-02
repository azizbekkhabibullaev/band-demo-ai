CREATE TABLE ingestion_jobs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  status            text        NOT NULL DEFAULT 'running',
  chunks_processed  int         NOT NULL DEFAULT 0,
  chunks_added      int         NOT NULL DEFAULT 0,
  chunks_updated    int         NOT NULL DEFAULT 0,
  chunks_deleted    int         NOT NULL DEFAULT 0,
  error             text,
  CHECK (status IN ('running', 'success', 'failed'))
);
