-- Lead status history (timeline) table
CREATE TABLE IF NOT EXISTS lead_status_history (
  id          bigserial    PRIMARY KEY,
  lead_id     uuid         NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id   text         NOT NULL,
  from_status text,
  to_status   text         NOT NULL,
  note        text,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_status_history_lead
  ON lead_status_history (lead_id, created_at);

-- Backfill initial "created" entry for every existing lead
INSERT INTO lead_status_history (lead_id, tenant_id, from_status, to_status, created_at)
SELECT id, tenant_id, NULL, status, created_at
FROM leads
WHERE id NOT IN (SELECT lead_id FROM lead_status_history)
ON CONFLICT DO NOTHING;

-- Also ensure the 'qualified' status value is allowed (re-apply in case 0014 didn't run cleanly)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new','contacted','qualified','converted','closed'));

-- Add full_name and lead_score if missing (idempotent from 0014)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS full_name   text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score  integer NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interest_type text;
