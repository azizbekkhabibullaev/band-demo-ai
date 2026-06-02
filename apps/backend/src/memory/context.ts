/**
 * Customer Context Memory — Enterprise Banking AI Platform
 *
 * Tracks and persists per-session customer context:
 *   - Detected language preference
 *   - Product interests (inferred from intents)
 *   - Intent history (for follow-up understanding)
 *   - Mentioned financial figures (amounts, terms)
 *   - Escalation & lead status
 *
 * Written to DB on each turn; read at session start to inject into prompt.
 */

import { getPool } from '../db/client.js';

export interface CustomerContext {
  sessionId: string;
  tenantId: string;
  detectedLang: string | undefined;
  preferredLang: string | undefined;
  productInterests: string[];
  intentHistory: string[];
  mentionedAmounts: string[];
  mentionedTerms: string[];
  lastIntent: string | undefined;
  lastTopic: string | undefined;
  escalated: boolean;
  leadCaptured: boolean;
  turnCount: number;
  contextData: Record<string, unknown>;
}

export async function getOrCreateContext(
  sessionId: string,
  tenantId: string,
): Promise<CustomerContext> {
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT * FROM customer_contexts WHERE session_id=$1 AND tenant_id=$2`,
    [sessionId, tenantId],
  );

  if (rows.length > 0) return mapRow(rows[0]);

  // Create blank context
  const { rows: inserted } = await pool.query(
    `INSERT INTO customer_contexts (session_id, tenant_id)
     VALUES ($1, $2) RETURNING *`,
    [sessionId, tenantId],
  );
  return mapRow(inserted[0]!);
}

export interface ContextUpdate {
  detectedLang?: string | undefined;
  preferredLang?: string | undefined;
  newProductInterest?: string | undefined;
  newIntent?: string | undefined;
  newAmount?: string | undefined;
  newTerm?: string | undefined;
  lastTopic?: string | undefined;
  escalated?: boolean | undefined;
  leadCaptured?: boolean | undefined;
  contextData?: Record<string, unknown> | undefined;
}

export async function updateContext(
  sessionId: string,
  tenantId: string,
  update: ContextUpdate,
): Promise<void> {
  const pool = getPool();

  // Build incremental update
  const updates: string[] = ['turn_count = turn_count + 1', 'updated_at = now()'];
  const params: unknown[] = [sessionId, tenantId];

  const addParam = (val: unknown): string => {
    params.push(val);
    return `$${params.length}`;
  };

  if (update.detectedLang) updates.push(`detected_lang = ${addParam(update.detectedLang)}`);
  if (update.preferredLang) updates.push(`preferred_lang = ${addParam(update.preferredLang)}`);
  if (update.lastTopic)    updates.push(`last_topic = ${addParam(update.lastTopic)}`);
  if (update.escalated !== undefined) updates.push(`escalated = ${addParam(update.escalated)}`);
  if (update.leadCaptured !== undefined) updates.push(`lead_captured = ${addParam(update.leadCaptured)}`);

  if (update.newProductInterest) {
    updates.push(`product_interests = array_append(product_interests, ${addParam(update.newProductInterest)})`);
    updates.push(`last_intent = ${addParam(update.newProductInterest)}`);
  }
  if (update.newIntent) {
    updates.push(`intent_history = array_append(intent_history, ${addParam(update.newIntent)})`);
    updates.push(`last_intent = ${addParam(update.newIntent)}`);
  }
  if (update.newAmount) {
    updates.push(`mentioned_amounts = array_append(mentioned_amounts, ${addParam(update.newAmount)})`);
  }
  if (update.newTerm) {
    updates.push(`mentioned_terms = array_append(mentioned_terms, ${addParam(update.newTerm)})`);
  }
  if (update.contextData) {
    updates.push(`context_data = context_data || ${addParam(JSON.stringify(update.contextData))}::jsonb`);
  }

  if (updates.length > 0) {
    await pool.query(
      `UPDATE customer_contexts SET ${updates.join(', ')}
       WHERE session_id=$1 AND tenant_id=$2`,
      params,
    );
  }
}

/** Build a context summary string to inject into the system prompt */
export function summarizeContext(ctx: CustomerContext): string {
  if (ctx.turnCount === 0) return '';

  const parts: string[] = [];

  if (ctx.productInterests.length > 0) {
    parts.push(`Customer product interests: ${[...new Set(ctx.productInterests)].join(', ')}`);
  }
  if (ctx.intentHistory.length > 0) {
    const recent = [...new Set(ctx.intentHistory)].slice(-3);
    parts.push(`Recent intents: ${recent.join(' → ')}`);
  }
  if (ctx.mentionedAmounts.length > 0) {
    parts.push(`Mentioned amounts: ${ctx.mentionedAmounts.slice(-2).join(', ')}`);
  }
  if (ctx.mentionedTerms.length > 0) {
    parts.push(`Mentioned terms: ${ctx.mentionedTerms.slice(-2).join(', ')}`);
  }
  if (ctx.lastTopic) {
    parts.push(`Last topic: ${ctx.lastTopic}`);
  }

  return parts.length > 0
    ? `### 🧠 Customer Memory\n${parts.map(p => `- ${p}`).join('\n')}\n`
    : '';
}

function mapRow(row: Record<string, unknown>): CustomerContext {
  return {
    sessionId: row['session_id'] as string,
    tenantId: row['tenant_id'] as string,
    detectedLang: row['detected_lang'] as string | undefined,
    preferredLang: row['preferred_lang'] as string | undefined,
    productInterests: (row['product_interests'] as string[]) ?? [],
    intentHistory: (row['intent_history'] as string[]) ?? [],
    mentionedAmounts: (row['mentioned_amounts'] as string[]) ?? [],
    mentionedTerms: (row['mentioned_terms'] as string[]) ?? [],
    lastIntent: row['last_intent'] as string | undefined,
    lastTopic: row['last_topic'] as string | undefined,
    escalated: Boolean(row['escalated']),
    leadCaptured: Boolean(row['lead_captured']),
    turnCount: Number(row['turn_count'] ?? 0),
    contextData: (row['context_data'] as Record<string, unknown>) ?? {},
  };
}
