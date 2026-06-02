ALTER TABLE messages
  ADD COLUMN tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE;

-- Composite index for analytics queries: "messages by tenant over time".
CREATE INDEX messages_tenant_created ON messages (tenant_id, created_at DESC);

-- Drop the previous analytics index that lacked tenant filter — superseded.
DROP INDEX messages_analytics_created;

COMMENT ON COLUMN messages.tenant_id IS
  'Denormalized from sessions.tenant_id for per-tenant analytics without a JOIN.';
