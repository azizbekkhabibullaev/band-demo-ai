-- Voice session tracking for analytics
CREATE TABLE IF NOT EXISTS voice_sessions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    text        NOT NULL,
  session_id   uuid        REFERENCES sessions(id) ON DELETE SET NULL,
  lang         text        NOT NULL DEFAULT 'ru',
  turn_count   integer     NOT NULL DEFAULT 0,
  duration_ms  integer,
  is_lead      boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz
);

CREATE INDEX IF NOT EXISTS voice_sessions_tenant_created
  ON voice_sessions (tenant_id, created_at DESC);
