-- Admin escalation events — auto-created by trend/complaint engine
-- or manually by operators from the admin dashboard
CREATE TABLE IF NOT EXISTS admin_escalations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         text        NOT NULL,
  description   text        NOT NULL,
  category      text        NOT NULL DEFAULT 'general',
  -- category: mobile_app | branch | card | loan | deposit | transfer | otp | service | general
  severity      text        NOT NULL DEFAULT 'medium',
  -- severity: low | medium | high | critical
  status        text        NOT NULL DEFAULT 'open',
  -- status: open | under_review | resolved
  trigger_count int         NOT NULL DEFAULT 1,  -- number of events that triggered this
  trigger_window_hours int NOT NULL DEFAULT 24,  -- detection window in hours
  auto_detected boolean     NOT NULL DEFAULT false,
  resolved_at   timestamptz,
  resolved_by   text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_escalations_tenant_status ON admin_escalations (tenant_id, status);
CREATE INDEX IF NOT EXISTS admin_escalations_tenant_created ON admin_escalations (tenant_id, created_at DESC);

-- Voice AI readiness: call transcripts and speech events
CREATE TABLE IF NOT EXISTS voice_calls (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel           text        NOT NULL DEFAULT 'phone',
  -- channel: phone | chat | email | social
  language          text,
  duration_seconds  int,
  transcript        text,
  whisper_segments  jsonb,      -- raw Whisper output segments
  classification    jsonb,      -- CallClassification from callcenter/types.ts
  sentiment         text,
  category          text,
  topics            text[],
  requires_followup boolean     NOT NULL DEFAULT false,
  customer_id       text,
  agent_id          text,
  external_call_id  text,       -- from telephony provider (e.g. Asterisk, Twilio)
  created_at        timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS voice_calls_tenant_created ON voice_calls (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_calls_tenant_channel ON voice_calls (tenant_id, channel);
