CREATE TABLE messages (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role                text        NOT NULL,
  content             text        NOT NULL,
  lang                text        NOT NULL,
  retrieved_chunk_ids uuid[]      NOT NULL DEFAULT '{}',
  retrieval_scores    real[]      NOT NULL DEFAULT '{}',
  prompt_tokens       int,
  completion_tokens   int,
  latency_ms          int,
  model               text,
  escalation_signaled boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (role IN ('user', 'assistant')),
  CHECK (lang IN ('uz', 'ru', 'en'))
);

CREATE INDEX messages_session_created   ON messages (session_id, created_at);
CREATE INDEX messages_analytics_created ON messages (created_at DESC);
