/**
 * Analytics Tracker — Enterprise Banking AI Platform
 *
 * Fire-and-forget event tracking with structured schema.
 * Never throws — errors are silently logged so analytics never breaks chat.
 */

import { getPool } from '../db/client.js';

export type EventType =
  | 'chat_turn'
  | 'faq_hit'
  | 'kb_hit'
  | 'intent_detected'
  | 'escalation'
  | 'lead_captured'
  | 'recommendation_shown'
  | 'product_viewed'
  | 'session_started'
  | 'session_ended';

export interface TrackEventParams {
  tenantId: string;
  sessionId?: string | undefined;
  messageId?: string | undefined;
  eventType: EventType;
  lang?: string | undefined;
  routingTier?: string | undefined;
  confidence?: number | undefined;
  intentName?: string | undefined;
  faqId?: string | undefined;
  kbChunkIds?: string[] | undefined;
  latencyMs?: number | undefined;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  properties?: Record<string, unknown> | undefined;
}

/** Fire-and-forget analytics event. Never throws. */
export function trackEvent(params: TrackEventParams): void {
  // Non-blocking — use void to detach from await chain
  void _insert(params);
}

async function _insert(params: TrackEventParams): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO analytics_events (
         tenant_id, session_id, message_id, event_type,
         lang, routing_tier, confidence, intent_name, faq_id,
         kb_chunk_ids, latency_ms, prompt_tokens, completion_tokens, properties
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        params.tenantId,
        params.sessionId ?? null,
        params.messageId ?? null,
        params.eventType,
        params.lang ?? null,
        params.routingTier ?? null,
        params.confidence ?? null,
        params.intentName ?? null,
        params.faqId ?? null,
        params.kbChunkIds ?? [],
        params.latencyMs ?? null,
        params.promptTokens ?? null,
        params.completionTokens ?? null,
        JSON.stringify(params.properties ?? {}),
      ],
    );
  } catch {
    // Silently swallow — analytics must never break the main chat flow
  }
}

// ─── Analytics query helpers ──────────────────────────────────────────────────

export interface DashboardStats {
  totalTurns: number;
  faqHitRate: number;
  kbHitRate: number;
  escalationRate: number;
  leadsToday: number;
  avgLatencyMs: number;
  avgConfidence: number;
  topIntents: { intent: string; count: number }[];
  topRoutingTiers: { tier: string; count: number }[];
  dailyVolume: { date: string; turns: number }[];
}

export async function getDashboardStats(
  tenantId: string,
  days: number = 7,
): Promise<DashboardStats> {
  const pool = getPool();

  const since = `now() - interval '${days} days'`;

  const [summary, intents, tiers, daily, leads] = await Promise.all([
    // Overall metrics
    pool.query<{
      total: string; faq_hits: string; kb_hits: string;
      escalations: string; avg_latency: string; avg_conf: string;
    }>(
      `SELECT
         COUNT(*)                                              AS total,
         COUNT(CASE WHEN event_type='faq_hit' THEN 1 END)    AS faq_hits,
         COUNT(CASE WHEN event_type='kb_hit' THEN 1 END)     AS kb_hits,
         COUNT(CASE WHEN event_type='escalation' THEN 1 END) AS escalations,
         AVG(latency_ms)                                      AS avg_latency,
         AVG(confidence)                                      AS avg_conf
       FROM analytics_events
       WHERE tenant_id=$1 AND created_at > ${since}`,
      [tenantId],
    ),

    // Top intents
    pool.query<{ intent_name: string; cnt: string }>(
      `SELECT intent_name, COUNT(*) AS cnt
       FROM analytics_events
       WHERE tenant_id=$1 AND intent_name IS NOT NULL AND created_at > ${since}
       GROUP BY intent_name
       ORDER BY cnt DESC
       LIMIT 10`,
      [tenantId],
    ),

    // Routing tier distribution
    pool.query<{ routing_tier: string; cnt: string }>(
      `SELECT routing_tier, COUNT(*) AS cnt
       FROM analytics_events
       WHERE tenant_id=$1 AND routing_tier IS NOT NULL AND created_at > ${since}
       GROUP BY routing_tier
       ORDER BY cnt DESC`,
      [tenantId],
    ),

    // Daily volume
    pool.query<{ day: string; turns: string }>(
      `SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS turns
       FROM analytics_events
       WHERE tenant_id=$1 AND event_type='chat_turn' AND created_at > ${since}
       GROUP BY day
       ORDER BY day`,
      [tenantId],
    ),

    // Leads today
    pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM leads
       WHERE tenant_id=$1 AND created_at > now() - interval '1 day'`,
      [tenantId],
    ),
  ]);

  const s = summary.rows[0]!;
  const total = parseInt(s.total, 10) || 1;

  return {
    totalTurns: parseInt(s.total, 10),
    faqHitRate: parseInt(s.faq_hits, 10) / total,
    kbHitRate: parseInt(s.kb_hits, 10) / total,
    escalationRate: parseInt(s.escalations, 10) / total,
    leadsToday: parseInt(leads.rows[0]?.cnt ?? '0', 10),
    avgLatencyMs: parseFloat(s.avg_latency ?? '0'),
    avgConfidence: parseFloat(s.avg_conf ?? '0'),
    topIntents: intents.rows.map(r => ({ intent: r.intent_name, count: parseInt(r.cnt, 10) })),
    topRoutingTiers: tiers.rows.map(r => ({ tier: r.routing_tier, count: parseInt(r.cnt, 10) })),
    dailyVolume: daily.rows.map(r => ({ date: String(r.day), turns: parseInt(r.turns, 10) })),
  };
}
