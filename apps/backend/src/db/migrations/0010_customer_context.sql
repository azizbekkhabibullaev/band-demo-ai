-- Customer context memory — persists structured knowledge about the customer across sessions
CREATE TABLE IF NOT EXISTS customer_contexts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id    uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  -- Detected customer profile
  detected_lang text,
  preferred_lang text,
  -- Financial profile (inferred from conversation)
  product_interests  text[]  NOT NULL DEFAULT '{}',
  intent_history     text[]  NOT NULL DEFAULT '{}',
  mentioned_amounts  text[]  NOT NULL DEFAULT '{}',
  mentioned_terms    text[]  NOT NULL DEFAULT '{}',
  -- Conversation state
  last_intent    text,
  last_topic     text,
  escalated      boolean     NOT NULL DEFAULT false,
  lead_captured  boolean     NOT NULL DEFAULT false,
  turn_count     int         NOT NULL DEFAULT 0,
  -- Raw flexible bag
  context_data   jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, session_id)
);

CREATE INDEX IF NOT EXISTS customer_contexts_session ON customer_contexts (session_id);
