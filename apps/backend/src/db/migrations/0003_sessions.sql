CREATE TABLE sessions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       text        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lang            text        NOT NULL DEFAULT 'ru',
  user_meta       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip_hash         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_active_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (lang IN ('uz', 'ru', 'en'))
);

CREATE INDEX sessions_tenant_active ON sessions (tenant_id, last_active_at DESC);

COMMENT ON COLUMN sessions.user_meta IS 'Opaque blob forwarded from host site (user_id, name, tier).';
COMMENT ON COLUMN sessions.ip_hash   IS 'sha256(ip + IP_HASH_SALT). Never store raw IP.';
