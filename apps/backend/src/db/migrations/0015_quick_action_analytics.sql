-- Quick action click analytics
CREATE TABLE IF NOT EXISTS quick_action_clicks (
  id          bigserial    PRIMARY KEY,
  tenant_id   text         NOT NULL,
  session_id  text,
  message_id  text,
  intent      text,
  lang        text,
  chip_label  text         NOT NULL,
  chip_type   text,        -- 'info' | 'lead'
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quick_action_clicks_tenant_created
  ON quick_action_clicks (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS quick_action_clicks_intent
  ON quick_action_clicks (tenant_id, intent);
