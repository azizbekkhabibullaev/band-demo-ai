-- Granular analytics event log
CREATE TABLE IF NOT EXISTS analytics_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id    uuid        REFERENCES sessions(id) ON DELETE SET NULL,
  message_id    uuid        REFERENCES messages(id) ON DELETE SET NULL,
  event_type    text        NOT NULL,
  -- event_type values:
  --   chat_turn, faq_hit, kb_hit, intent_detected, escalation,
  --   lead_captured, recommendation_shown, product_viewed
  lang          text,
  routing_tier  text,
  confidence    float,
  intent_name   text,
  faq_id        text,
  kb_chunk_ids  text[],
  latency_ms    int,
  prompt_tokens int,
  completion_tokens int,
  properties    jsonb       NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_tenant_type ON analytics_events (tenant_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_tenant_date ON analytics_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session ON analytics_events (session_id);

-- Materialized summary view (refreshed by a job / on-demand)
CREATE TABLE IF NOT EXISTS analytics_daily (
  tenant_id          text        NOT NULL,
  event_date         date        NOT NULL,
  total_turns        int         NOT NULL DEFAULT 0,
  faq_hits           int         NOT NULL DEFAULT 0,
  kb_hits            int         NOT NULL DEFAULT 0,
  escalations        int         NOT NULL DEFAULT 0,
  leads_captured     int         NOT NULL DEFAULT 0,
  avg_confidence     float,
  avg_latency_ms     float,
  avg_prompt_tokens  float,
  top_intents        jsonb       NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, event_date)
);
