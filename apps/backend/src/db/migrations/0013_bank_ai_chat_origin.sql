-- Add bank-ai-chat.vercel.app to ipoteka-bank allowed origins.
-- Idempotent: only appends if the value is not already present.
UPDATE tenants
SET    allowed_origins = array_append(allowed_origins, 'https://bank-ai-chat.vercel.app')
WHERE  id = 'ipoteka-bank'
AND    NOT ('https://bank-ai-chat.vercel.app' = ANY(allowed_origins));
