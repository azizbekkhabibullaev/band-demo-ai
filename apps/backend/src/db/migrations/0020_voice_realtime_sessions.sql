-- Realtime Voice Sessions — Phase 3 (OpenAI Realtime API)
-- Stores per-call analytics, transcript, WOW summary, and lead linkage.
CREATE TABLE IF NOT EXISTS realtime_voice_sessions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id         uuid        REFERENCES sessions(id) ON DELETE SET NULL,

  -- Call metadata
  duration_ms        integer,
  turn_count         integer     NOT NULL DEFAULT 0,
  lang               text        NOT NULL DEFAULT 'ru',

  -- Full conversation transcript (accumulated from realtime transcription)
  transcript         text,

  -- AI-analysed fields (populated at call end via GPT-4o-mini)
  topic_summary      text,
  products_discussed text[],
  detected_intent    text,

  -- Lead info
  lead_status        text        CHECK (lead_status IN ('hot','warm','cold','none')),
  lead_score         integer     NOT NULL DEFAULT 0,
  lead_id            uuid        REFERENCES leads(id) ON DELETE SET NULL,

  -- Sentiment & quality flags
  sentiment          text        CHECK (sentiment IN ('positive','neutral','negative')),
  complaint_flag     boolean     NOT NULL DEFAULT false,
  escalation_flag    boolean     NOT NULL DEFAULT false,

  -- Executive WOW summary JSON
  -- Schema: { duration_seconds, topic, interest_level, lead_status, sentiment,
  --           products_discussed[], next_action, key_signals[] }
  wow_summary        jsonb,

  created_at         timestamptz NOT NULL DEFAULT now(),
  ended_at           timestamptz
);

CREATE INDEX IF NOT EXISTS realtime_vs_tenant_created
  ON realtime_voice_sessions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS realtime_vs_tenant_lead
  ON realtime_voice_sessions (tenant_id, lead_status)
  WHERE lead_status IN ('hot', 'warm');
