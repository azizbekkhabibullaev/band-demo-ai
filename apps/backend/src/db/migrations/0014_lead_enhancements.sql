-- Lead enhancements: full_name, lead_score, qualified status, interest_type
-- Idempotent — uses IF NOT EXISTS / DO blocks.

-- 1. Add full_name column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS full_name text;

-- 2. Add lead_score (0-100)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score integer NOT NULL DEFAULT 0;

-- 3. Add interest_type (normalised product category)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS interest_type text;

-- 4. Extend status CHECK to include 'qualified'
--    Drop old constraint, add new one with qualified included.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new','contacted','qualified','converted','closed'));

-- 5. Index on lead_score for hot-lead sorting
CREATE INDEX IF NOT EXISTS leads_tenant_score ON leads (tenant_id, lead_score DESC);
