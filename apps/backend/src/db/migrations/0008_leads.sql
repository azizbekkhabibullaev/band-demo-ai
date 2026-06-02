-- Lead capture records for callback / consultation requests
CREATE TABLE IF NOT EXISTS leads (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id    uuid        REFERENCES sessions(id) ON DELETE SET NULL,
  lead_type     text        NOT NULL CHECK (lead_type IN ('callback','consultation','escalation','product_interest')),
  status        text        NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','converted','closed')),
  -- Customer-provided info
  phone         text,
  preferred_time text,
  product_interest text,
  message       text,
  -- System metadata
  lang          text        NOT NULL DEFAULT 'ru',
  intent_name   text,
  routing_tier  text,
  confidence    float,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_tenant_status ON leads (tenant_id, status);
CREATE INDEX IF NOT EXISTS leads_tenant_created ON leads (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_session ON leads (session_id);
