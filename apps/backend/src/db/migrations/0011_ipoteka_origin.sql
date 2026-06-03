-- Add new Vercel production domain to ipoteka-bank allowed origins.
-- Idempotent: only appends if the value is not already present.
UPDATE tenants
SET    allowed_origins = array_append(allowed_origins, 'https://ipoteka-chat-ai.vercel.app')
WHERE  id = 'ipoteka-bank'
AND    NOT ('https://ipoteka-chat-ai.vercel.app' = ANY(allowed_origins));
