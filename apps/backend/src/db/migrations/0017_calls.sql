-- Voice of Customer (VOC) Analytics Platform
-- Stores call center audio recordings and AI analysis results

CREATE TABLE IF NOT EXISTS calls (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename         text        NOT NULL,
  file_path        text,                     -- path on disk (relative to project root)
  duration_seconds integer     DEFAULT 0,
  language         text        DEFAULT 'ru',
  transcript       text,
  summary          text,
  sentiment        text        CHECK (sentiment IN ('positive','neutral','negative')),
  sentiment_score  float,
  category         text,
  subcategory      text,
  priority         text        CHECK (priority IN ('low','medium','high','critical')),
  topics           jsonb       DEFAULT '[]'::jsonb,
  is_lead          boolean     NOT NULL DEFAULT FALSE,
  lead_score       integer     NOT NULL DEFAULT 0,
  lead_interest    text,
  lead_id          uuid        REFERENCES leads(id) ON DELETE SET NULL,
  is_complaint     boolean     NOT NULL DEFAULT FALSE,
  complaint_notes  text,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','processing','completed','failed')),
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calls_tenant_created   ON calls (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_tenant_status    ON calls (tenant_id, status);
CREATE INDEX IF NOT EXISTS calls_tenant_sentiment ON calls (tenant_id, sentiment);
CREATE INDEX IF NOT EXISTS calls_tenant_category  ON calls (tenant_id, category);
CREATE INDEX IF NOT EXISTS calls_lead_id          ON calls (lead_id) WHERE lead_id IS NOT NULL;
