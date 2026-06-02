CREATE TABLE tenants (
  id               text        PRIMARY KEY,
  name             text        NOT NULL,
  status           text        NOT NULL DEFAULT 'active',
  allowed_origins  text[]      NOT NULL DEFAULT '{}',
  config           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('active', 'disabled'))
);

COMMENT ON TABLE  tenants IS 'One row per bank (multi-tenant SaaS).';
COMMENT ON COLUMN tenants.id              IS 'Public identifier used in widget embeds, e.g. "demo-bank".';
COMMENT ON COLUMN tenants.allowed_origins IS 'CORS allow-list — exact origin match (https://bank.com).';
COMMENT ON COLUMN tenants.config          IS 'JSON: branding, languages, hotline, model, limits, greeting. Validated in code.';
