import { getPool } from './client.js';

export interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  lang: string;
}

export interface SessionInfo {
  id: string;
  tenant_id: string;
  lang: string;
}

export interface SessionWithHistory {
  session: SessionInfo;
  messages: MessageRow[];
}

export async function getSessionWithHistory(
  sessionId: string,
  tenantId: string,
): Promise<SessionWithHistory | null> {
  const pool = getPool();

  const { rows: sessionRows } = await pool.query<SessionInfo>(
    `SELECT id, tenant_id, lang
       FROM sessions
      WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId],
  );
  if (sessionRows.length === 0) return null;
  const session = sessionRows[0]!;

  // Fetch last 12 messages (DESC so LIMIT gets the most recent); reverse for chronological order.
  const { rows: msgRows } = await pool.query<MessageRow>(
    `SELECT id, role, content, lang
       FROM messages
      WHERE session_id = $1
      ORDER BY created_at DESC
      LIMIT 12`,
    [sessionId],
  );

  return { session, messages: msgRows.reverse() };
}

export interface InsertMessageParams {
  sessionId: string;
  tenantId: string;
  role: 'user' | 'assistant';
  content: string;
  lang: string;
  retrievedChunkIds?: string[];
  retrievalScores?: number[];
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  model?: string | null;
  escalationSignaled?: boolean;
}

export async function insertMessage(params: InsertMessageParams): Promise<{ id: string }> {
  const pool = getPool();

  await pool.query(
    `UPDATE sessions SET last_active_at = now() WHERE id = $1 AND tenant_id = $2`,
    [params.sessionId, params.tenantId],
  );

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO messages (
       session_id, tenant_id, role, content, lang,
       retrieved_chunk_ids, retrieval_scores,
       prompt_tokens, completion_tokens, latency_ms, model, escalation_signaled
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      params.sessionId,
      params.tenantId,
      params.role,
      params.content,
      params.lang,
      params.retrievedChunkIds ?? [],
      params.retrievalScores ?? [],
      params.promptTokens ?? null,
      params.completionTokens ?? null,
      params.latencyMs ?? null,
      params.model ?? null,
      params.escalationSignaled ?? false,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error('INSERT messages returned no row');
  return { id: row.id };
}
