/**
 * Customer Intelligence Engine
 *
 * Powers the admin dashboard's analytics:
 *   - Topic analysis (what customers ask about most)
 *   - Complaint detection + classification
 *   - Trend detection (current vs previous period)
 *   - Conversation summary for the conversations list
 *   - AI-generated executive insights via OpenAI
 *   - Escalation auto-detection
 */

import { getPool } from '../db/client.js';
import { streamChatCompletion } from '../llm/openai.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TopicStat {
  topic: string;
  displayName: string;
  count: number;
  pct: number;
  trend: 'up' | 'down' | 'stable';
  trendPct: number;
}

export interface ComplaintStat {
  category: string;
  displayName: string;
  count: number;
  pct: number;
  severity: 'low' | 'medium' | 'high';
  trend: 'up' | 'down' | 'stable';
}

export interface TrendItem {
  label: string;
  current: number;
  previous: number;
  changePct: number;
  direction: 'up' | 'down' | 'stable';
  isAnomaly: boolean; // change > 40%
}

export interface ConversationSummary {
  sessionId: string;
  startedAt: string;
  lang: string;
  messageCount: number;
  userMessageCount: number;
  lastUserMessage: string;
  topIntent: string | null;
  hadEscalation: boolean;
  hadLead: boolean;
}

export interface KpiSnapshot {
  totalSessions: number;
  totalTurns: number;
  uniqueSessionsToday: number;
  containmentRate: number;      // 1 - escalation_rate
  leadRate: number;
  avgLatencyMs: number;
  avgConfidence: number;
  escalationsOpen: number;
}

// ─── COMPLAINT PATTERNS ───────────────────────────────────────────────────────

const COMPLAINT_PATTERNS: Array<{
  category: string;
  displayName: string;
  severity: 'low' | 'medium' | 'high';
  patterns: RegExp[];
}> = [
  {
    category: 'mobile_app',
    displayName: 'Mobile App',
    severity: 'high',
    patterns: [
      /не\s*работает.*прилож|приложение.*не\s*работает/i,
      /ilova.*ishlamayapti|ishlamayapti.*ilova/i,
      /app.*not\s*work|doesn'?t\s*work.*app/i,
      /ошибка.*прилож|прилож.*ошибк/i,
      /ilovada.*muammo|muammo.*ilova/i,
      /crash|freezes?|зависает|muzlab/i,
      /мобильн.*банк.*проблем|проблем.*мобильн/i,
    ],
  },
  {
    category: 'card',
    displayName: 'Card Issues',
    severity: 'high',
    patterns: [
      /карт.*заблокирован|заблокировали.*карт/i,
      /karta.*bloklan|bloklan.*karta/i,
      /card.*block|block.*card/i,
      /картой.*не\s*могу|не\s*могу.*картой/i,
      /карт.*не\s*работает/i,
      /karta.*ishlamayapti/i,
      /платеж.*отклонен|отклонил.*платеж/i,
      /payment.*declined|declined.*payment/i,
    ],
  },
  {
    category: 'branch',
    displayName: 'Branch Service',
    severity: 'medium',
    patterns: [
      /filial.*yomon|yomon.*xizmat/i,
      /отделение.*плох|плох.*обслужив/i,
      /branch.*terrible|bad.*service.*branch/i,
      /очередь|navbat|queue|waiting\s*too\s*long/i,
      /грубо|xodim.*yomon|rude.*staff/i,
      /долго\s*ждать|uzoq\s*kutdi/i,
    ],
  },
  {
    category: 'loan',
    displayName: 'Loan Issues',
    severity: 'medium',
    patterns: [
      /кредит.*отказ|отказали.*кредит/i,
      /kredit.*rad|rad\s*etish.*kredit/i,
      /loan.*reject|reject.*loan/i,
      /высок.*ставк|stavka.*yuqori/i,
      /interest.*too\s*high/i,
      /долг.*повышен|долг.*увелич/i,
    ],
  },
  {
    category: 'deposit',
    displayName: 'Deposit Issues',
    severity: 'low',
    patterns: [
      /вклад.*не\s*начисл|не\s*начисл.*процент/i,
      /depozit.*foiz.*yoq|foiz.*hisoblanmad/i,
      /deposit.*interest.*not/i,
      /закрыть\s*вклад.*проблем/i,
      /depozit.*yopish.*muammo/i,
    ],
  },
  {
    category: 'transfer',
    displayName: 'Transfer/Payment',
    severity: 'high',
    patterns: [
      /перевод.*не\s*дошел|не\s*получил.*перевод/i,
      /o'tkazma.*kelmadi|pul.*kelmadi/i,
      /transfer.*failed|payment.*not\s*received/i,
      /деньги.*пропали|деньги.*исчезли/i,
      /pul.*yo'qoldi/i,
      /money.*disappeared|lost.*money/i,
      /двойн.*списан|дважды\s*сняли/i,
      /ikki\s*marta.*yechildi/i,
    ],
  },
  {
    category: 'otp',
    displayName: 'OTP / SMS Issues',
    severity: 'high',
    patterns: [
      /sms.*не\s*приход|код.*не\s*приход/i,
      /sms.*kelmayapti|kod.*kelmayapti/i,
      /otp.*not\s*receiv|sms.*not\s*coming/i,
      /подтверждение.*не\s*приход/i,
      /tasdiqlash\s*kodi.*kelmadi/i,
    ],
  },
  {
    category: 'service_quality',
    displayName: 'Service Quality',
    severity: 'low',
    patterns: [
      /ужасн.*сервис|сервис.*ужасн/i,
      /xizmat.*yomon|yomon.*xizmat/i,
      /terrible.*service|poor.*service/i,
      /жалоба|shikoyat|complaint/i,
      /требую.*компенсац|возмещен/i,
      /недоволен|норози/i,
      /disappointed/i,
    ],
  },
];

// ─── Topic intent mapping ─────────────────────────────────────────────────────

const INTENT_DISPLAY: Record<string, string> = {
  depozit: 'Deposits',
  kredit_ariza: 'Loan Applications',
  kredit_tatil: 'Loan Holidays',
  karta_chiqarish: 'Cards',
  hisob_ochish: 'Accounts',
  ipoteka: 'Mortgages',
  o_tkazma: 'Transfers',
  to_lov: 'Payments',
  mobile_bank: 'Mobile Banking',
  filial: 'Branches',
  valyuta: 'Currency',
  boshqa_savol: 'Other',
};

// ─── KPI snapshot ─────────────────────────────────────────────────────────────

export async function getKpiSnapshot(tenantId: string, days: number): Promise<KpiSnapshot> {
  const pool = getPool();
  const interval = `${days} days`;

  const [turns, sessions, today, escalations, leads] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)                                               AS total,
         COUNT(CASE WHEN event_type='escalation' THEN 1 END)  AS escalations,
         COUNT(CASE WHEN event_type='lead_captured' THEN 1 END) AS leads,
         AVG(latency_ms)                                        AS avg_latency,
         AVG(confidence)                                        AS avg_conf
       FROM analytics_events
       WHERE tenant_id=$1 AND event_type='chat_turn'
         AND created_at > now() - interval '${interval}'`,
      [tenantId],
    ),
    pool.query(
      `SELECT COUNT(DISTINCT session_id) AS cnt
       FROM analytics_events
       WHERE tenant_id=$1 AND created_at > now() - interval '${interval}'`,
      [tenantId],
    ),
    pool.query(
      `SELECT COUNT(DISTINCT session_id) AS cnt
       FROM analytics_events
       WHERE tenant_id=$1 AND created_at > now() - interval '1 day'`,
      [tenantId],
    ),
    pool.query(
      `SELECT COUNT(*) AS cnt FROM admin_escalations
       WHERE tenant_id=$1 AND status='open'`,
      [tenantId],
    ),
    pool.query(
      `SELECT COUNT(*) AS cnt FROM leads
       WHERE tenant_id=$1 AND created_at > now() - interval '${interval}'`,
      [tenantId],
    ),
  ]);

  const t = turns.rows[0] as Record<string, string>;
  const total = parseInt(t['total'] ?? '0', 10) || 1;
  const totalLeads = parseInt(leads.rows[0]?.['cnt'] ?? '0', 10);
  const totalEscalations = parseInt(t['escalations'] ?? '0', 10);

  return {
    totalSessions: parseInt(sessions.rows[0]?.['cnt'] ?? '0', 10),
    totalTurns: total,
    uniqueSessionsToday: parseInt(today.rows[0]?.['cnt'] ?? '0', 10),
    containmentRate: Math.max(0, 1 - totalEscalations / total),
    leadRate: totalLeads / total,
    avgLatencyMs: parseFloat(t['avg_latency'] ?? '0'),
    avgConfidence: parseFloat(t['avg_conf'] ?? '0'),
    escalationsOpen: parseInt(escalations.rows[0]?.['cnt'] ?? '0', 10),
  };
}

// ─── Topic analysis ───────────────────────────────────────────────────────────

export async function getTopicStats(tenantId: string, days: number): Promise<TopicStat[]> {
  const pool = getPool();
  const interval = `${days} days`;
  const prevInterval = `${days * 2} days`;

  const [current, previous] = await Promise.all([
    pool.query<{ intent_name: string; cnt: string }>(
      `SELECT intent_name, COUNT(*) AS cnt
       FROM analytics_events
       WHERE tenant_id=$1 AND intent_name IS NOT NULL
         AND created_at > now() - interval '${interval}'
       GROUP BY intent_name ORDER BY cnt DESC LIMIT 10`,
      [tenantId],
    ),
    pool.query<{ intent_name: string; cnt: string }>(
      `SELECT intent_name, COUNT(*) AS cnt
       FROM analytics_events
       WHERE tenant_id=$1 AND intent_name IS NOT NULL
         AND created_at BETWEEN now() - interval '${prevInterval}' AND now() - interval '${interval}'
       GROUP BY intent_name ORDER BY cnt DESC LIMIT 10`,
      [tenantId],
    ),
  ]);

  const prevMap = new Map(previous.rows.map(r => [r.intent_name, parseInt(r.cnt, 10)]));
  const total = current.rows.reduce((s, r) => s + parseInt(r.cnt, 10), 0) || 1;

  return current.rows.map(r => {
    const count = parseInt(r.cnt, 10);
    const prev = prevMap.get(r.intent_name) ?? 0;
    const changePct = prev > 0 ? ((count - prev) / prev) * 100 : 0;
    return {
      topic: r.intent_name,
      displayName: INTENT_DISPLAY[r.intent_name] ?? r.intent_name,
      count,
      pct: Math.round((count / total) * 100),
      trend: changePct > 5 ? 'up' : changePct < -5 ? 'down' : 'stable',
      trendPct: Math.round(changePct),
    };
  });
}

// ─── Complaint analysis ───────────────────────────────────────────────────────

export async function getComplaintStats(tenantId: string, days: number): Promise<ComplaintStat[]> {
  const pool = getPool();
  const interval = `${days} days`;
  const prevInterval = `${days * 2} days`;

  // Fetch recent user messages
  const [current, previous] = await Promise.all([
    pool.query<{ content: string }>(
      `SELECT m.content FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.tenant_id=$1 AND m.role='user'
         AND m.created_at > now() - interval '${interval}'
       LIMIT 5000`,
      [tenantId],
    ),
    pool.query<{ content: string }>(
      `SELECT m.content FROM messages m
       JOIN sessions s ON s.id = m.session_id
       WHERE s.tenant_id=$1 AND m.role='user'
         AND m.created_at BETWEEN now() - interval '${prevInterval}' AND now() - interval '${interval}'
       LIMIT 5000`,
      [tenantId],
    ),
  ]);

  const classify = (messages: { content: string }[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const { content } of messages) {
      for (const cat of COMPLAINT_PATTERNS) {
        if (cat.patterns.some(p => p.test(content))) {
          counts.set(cat.category, (counts.get(cat.category) ?? 0) + 1);
        }
      }
    }
    return counts;
  };

  const currCounts = classify(current.rows);
  const prevCounts = classify(previous.rows);
  const total = [...currCounts.values()].reduce((a, b) => a + b, 0) || 1;

  return COMPLAINT_PATTERNS.map(cat => {
    const count = currCounts.get(cat.category) ?? 0;
    const prev = prevCounts.get(cat.category) ?? 0;
    const changePct = prev > 0 ? ((count - prev) / prev) * 100 : 0;
    const trend: 'up' | 'down' | 'stable' = changePct > 10 ? 'up' : changePct < -10 ? 'down' : 'stable';
    return {
      category: cat.category,
      displayName: cat.displayName,
      count,
      pct: Math.round((count / total) * 100),
      severity: cat.severity,
      trend,
    };
  }).sort((a, b) => b.count - a.count);
}

// ─── Trend detection ──────────────────────────────────────────────────────────

export async function getTrendItems(tenantId: string, days: number): Promise<TrendItem[]> {
  const pool = getPool();
  const interval = `${days} days`;
  const prevInterval = `${days * 2} days`;

  const [curr, prev] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)                                                    AS turns,
         COUNT(CASE WHEN event_type='escalation' THEN 1 END)       AS escalations,
         COUNT(CASE WHEN event_type='lead_captured' THEN 1 END)    AS leads,
         COUNT(CASE WHEN event_type='faq_hit' THEN 1 END)          AS faq_hits,
         COUNT(DISTINCT session_id)                                  AS sessions,
         COUNT(CASE WHEN intent_name='depozit' THEN 1 END)         AS depozit,
         COUNT(CASE WHEN intent_name='kredit_ariza' THEN 1 END)    AS kredit,
         COUNT(CASE WHEN intent_name='mobile_bank' THEN 1 END)     AS mobile_bank,
         COUNT(CASE WHEN intent_name='karta_chiqarish' THEN 1 END) AS karta
       FROM analytics_events
       WHERE tenant_id=$1 AND created_at > now() - interval '${interval}'`,
      [tenantId],
    ),
    pool.query(
      `SELECT
         COUNT(*)                                                    AS turns,
         COUNT(CASE WHEN event_type='escalation' THEN 1 END)       AS escalations,
         COUNT(CASE WHEN event_type='lead_captured' THEN 1 END)    AS leads,
         COUNT(CASE WHEN event_type='faq_hit' THEN 1 END)          AS faq_hits,
         COUNT(DISTINCT session_id)                                  AS sessions,
         COUNT(CASE WHEN intent_name='depozit' THEN 1 END)         AS depozit,
         COUNT(CASE WHEN intent_name='kredit_ariza' THEN 1 END)    AS kredit,
         COUNT(CASE WHEN intent_name='mobile_bank' THEN 1 END)     AS mobile_bank,
         COUNT(CASE WHEN intent_name='karta_chiqarish' THEN 1 END) AS karta
       FROM analytics_events
       WHERE tenant_id=$1
         AND created_at BETWEEN now() - interval '${prevInterval}' AND now() - interval '${interval}'`,
      [tenantId],
    ),
  ]);

  const c = curr.rows[0] as Record<string, string>;
  const p = prev.rows[0] as Record<string, string>;

  const makeItem = (label: string, key: string): TrendItem => {
    const current = parseInt(c[key] ?? '0', 10);
    const previous = parseInt(p[key] ?? '0', 10);
    const changePct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
    return {
      label,
      current,
      previous,
      changePct,
      direction: changePct > 3 ? 'up' : changePct < -3 ? 'down' : 'stable',
      isAnomaly: Math.abs(changePct) >= 40,
    };
  };

  return [
    makeItem('Total Conversations', 'turns'),
    makeItem('Unique Sessions', 'sessions'),
    makeItem('Escalations', 'escalations'),
    makeItem('Leads Captured', 'leads'),
    makeItem('FAQ Hits', 'faq_hits'),
    makeItem('Deposit Inquiries', 'depozit'),
    makeItem('Loan Requests', 'kredit'),
    makeItem('Mobile Banking', 'mobile_bank'),
    makeItem('Card Requests', 'karta'),
  ];
}

// ─── Conversation list ────────────────────────────────────────────────────────

export async function getConversationList(
  tenantId: string,
  opts: { limit?: number; offset?: number; lang?: string; search?: string },
): Promise<{ conversations: ConversationSummary[]; total: number }> {
  const pool = getPool();
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  let where = `s.tenant_id = $1`;
  const params: unknown[] = [tenantId];

  if (opts.lang) {
    params.push(opts.lang);
    where += ` AND s.lang = $${params.length}`;
  }

  const totalRes = await pool.query(
    `SELECT COUNT(*) AS cnt FROM sessions s WHERE ${where}`,
    params,
  );
  const total = parseInt(totalRes.rows[0]?.['cnt'] ?? '0', 10);

  const rows = await pool.query(
    `SELECT
       s.id                   AS session_id,
       s.created_at           AS started_at,
       s.lang,
       COUNT(m.id)            AS message_count,
       COUNT(CASE WHEN m.role='user' THEN 1 END) AS user_message_count,
       (SELECT content FROM messages WHERE session_id=s.id AND role='user'
        ORDER BY created_at DESC LIMIT 1)        AS last_user_message,
       (SELECT intent_name FROM analytics_events
        WHERE session_id=s.id AND intent_name IS NOT NULL
        ORDER BY created_at DESC LIMIT 1)         AS top_intent,
       BOOL_OR(m.escalation_signaled)             AS had_escalation,
       EXISTS(SELECT 1 FROM leads l WHERE l.session_id=s.id) AS had_lead
     FROM sessions s
     LEFT JOIN messages m ON m.session_id = s.id
     WHERE ${where}
     GROUP BY s.id, s.created_at, s.lang
     ORDER BY s.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  const conversations: ConversationSummary[] = rows.rows.map(r => ({
    sessionId: r['session_id'] as string,
    startedAt: String(r['started_at']),
    lang: r['lang'] as string,
    messageCount: parseInt(String(r['message_count'] ?? '0'), 10),
    userMessageCount: parseInt(String(r['user_message_count'] ?? '0'), 10),
    lastUserMessage: (r['last_user_message'] as string | null) ?? '',
    topIntent: (r['top_intent'] as string | null) ?? null,
    hadEscalation: r['had_escalation'] as boolean,
    hadLead: r['had_lead'] as boolean,
  }));

  // Apply search filter in-memory (simple)
  const filtered = opts.search
    ? conversations.filter(c =>
        c.lastUserMessage.toLowerCase().includes(opts.search!.toLowerCase()) ||
        (c.topIntent ?? '').toLowerCase().includes(opts.search!.toLowerCase()),
      )
    : conversations;

  return { conversations: filtered, total };
}

// ─── Daily volume ─────────────────────────────────────────────────────────────

export async function getDailyVolume(
  tenantId: string,
  days: number,
): Promise<{ date: string; turns: number; sessions: number; escalations: number }[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT
       date_trunc('day', created_at)::date                     AS day,
       COUNT(CASE WHEN event_type='chat_turn' THEN 1 END)     AS turns,
       COUNT(DISTINCT session_id)                               AS sessions,
       COUNT(CASE WHEN event_type='escalation' THEN 1 END)    AS escalations
     FROM analytics_events
     WHERE tenant_id=$1 AND created_at > now() - interval '${days} days'
     GROUP BY day ORDER BY day`,
    [tenantId],
  );
  return rows.map(r => ({
    date: String(r['day']),
    turns: parseInt(String(r['turns'] ?? '0'), 10),
    sessions: parseInt(String(r['sessions'] ?? '0'), 10),
    escalations: parseInt(String(r['escalations'] ?? '0'), 10),
  }));
}

// ─── Lead Funnel ─────────────────────────────────────────────────────────────

export interface LeadFunnel {
  new: number;
  contacted: number;
  qualified: number;
  converted: number;
  closed: number;
  hot: number;
  warm: number;
  total: number;
}

export async function getLeadFunnel(tenantId: string): Promise<LeadFunnel> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT status, COUNT(*) AS cnt,
            SUM(CASE WHEN lead_score >= 90 THEN 1 ELSE 0 END) AS hot,
            SUM(CASE WHEN lead_score >= 70 AND lead_score < 90 THEN 1 ELSE 0 END) AS warm
     FROM leads WHERE tenant_id=$1 GROUP BY status`,
    [tenantId],
  );
  const result: LeadFunnel = { new: 0, contacted: 0, qualified: 0, converted: 0, closed: 0, hot: 0, warm: 0, total: 0 };
  for (const row of rows) {
    const status = row['status'] as string;
    const cnt = parseInt(row['cnt'] as string, 10);
    if (status in result) (result as unknown as Record<string, number>)[status] = cnt;
    result.hot += parseInt(row['hot'] as string, 10) || 0;
    result.warm += parseInt(row['warm'] as string, 10) || 0;
    result.total += cnt;
  }
  return result;
}

// ─── Escalation CRUD ─────────────────────────────────────────────────────────

export async function getEscalations(tenantId: string, status?: string) {
  const pool = getPool();
  let sql = `SELECT * FROM admin_escalations WHERE tenant_id=$1`;
  const params: unknown[] = [tenantId];
  if (status) {
    params.push(status);
    sql += ` AND status=$${params.length}`;
  }
  sql += ' ORDER BY created_at DESC LIMIT 50';
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function updateEscalationStatus(
  id: string,
  tenantId: string,
  status: string,
  notes?: string,
): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE admin_escalations
     SET status=$1, notes=COALESCE($2, notes),
         resolved_at = CASE WHEN $1='resolved' THEN now() ELSE NULL END,
         updated_at=now()
     WHERE id=$3 AND tenant_id=$4`,
    [status, notes ?? null, id, tenantId],
  );
  return (rowCount ?? 0) > 0;
}

export async function createEscalation(
  tenantId: string,
  data: {
    title: string;
    description: string;
    category: string;
    severity: string;
    autoDetected?: boolean;
    triggerCount?: number;
  },
): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO admin_escalations
       (tenant_id, title, description, category, severity, auto_detected, trigger_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      tenantId,
      data.title,
      data.description,
      data.category,
      data.severity,
      data.autoDetected ?? false,
      data.triggerCount ?? 1,
    ],
  );
  return rows[0]?.['id'] as string;
}

// ─── Auto-escalation engine ───────────────────────────────────────────────────

export async function runEscalationEngine(tenantId: string): Promise<number> {
  const pool = getPool();
  let created = 0;

  // Check for complaint spikes in last 24h
  const { rows: messages } = await pool.query<{ content: string }>(
    `SELECT m.content FROM messages m
     JOIN sessions s ON s.id = m.session_id
     WHERE s.tenant_id=$1 AND m.role='user'
       AND m.created_at > now() - interval '24 hours'`,
    [tenantId],
  );

  const counts = new Map<string, number>();
  for (const { content } of messages) {
    for (const cat of COMPLAINT_PATTERNS) {
      if (cat.patterns.some(p => p.test(content))) {
        counts.set(cat.category, (counts.get(cat.category) ?? 0) + 1);
      }
    }
  }

  const THRESHOLD = 10; // 10+ complaints in 24h → escalation
  for (const [category, count] of counts.entries()) {
    if (count < THRESHOLD) continue;

    // Check if escalation already exists for this category in last 24h
    const { rows: existing } = await pool.query(
      `SELECT id FROM admin_escalations
       WHERE tenant_id=$1 AND category=$2 AND auto_detected=true
         AND created_at > now() - interval '24 hours'
         AND status != 'resolved'`,
      [tenantId, category],
    );
    if (existing.length > 0) continue;

    const catDef = COMPLAINT_PATTERNS.find(c => c.category === category);
    await createEscalation(tenantId, {
      title: `${catDef?.displayName ?? category}: ${count} complaints in 24h`,
      description: `Auto-detected: ${count} user messages matched "${catDef?.displayName ?? category}" complaint patterns within the last 24 hours. Immediate review recommended.`,
      category,
      severity: catDef?.severity ?? 'medium',
      autoDetected: true,
      triggerCount: count,
    });
    created++;
  }

  return created;
}

// ─── AI Insights ──────────────────────────────────────────────────────────────

export async function generateAiInsights(tenantId: string, days: number): Promise<string[]> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) return ['OpenAI API key not configured.'];

  const [kpi, topics, complaints, trends] = await Promise.all([
    getKpiSnapshot(tenantId, days),
    getTopicStats(tenantId, days),
    getComplaintStats(tenantId, days),
    getTrendItems(tenantId, days),
  ]);

  const summary = `
Banking AI Platform Analytics Summary (last ${days} days):

KPIs:
- Total conversations: ${kpi.totalTurns}
- Unique sessions: ${kpi.totalSessions}
- AI containment rate: ${(kpi.containmentRate * 100).toFixed(1)}%
- Lead generation rate: ${(kpi.leadRate * 100).toFixed(1)}%
- Average response latency: ${kpi.avgLatencyMs.toFixed(0)}ms
- Open escalations: ${kpi.escalationsOpen}

Top Topics (by volume):
${topics.slice(0, 5).map((t, i) => `${i + 1}. ${t.displayName}: ${t.count} queries (${t.pct}%) — trend: ${t.trend} ${t.trendPct > 0 ? '+' : ''}${t.trendPct}%`).join('\n')}

Complaint Distribution:
${complaints.filter(c => c.count > 0).slice(0, 5).map(c => `- ${c.displayName}: ${c.count} complaints, trend: ${c.trend}`).join('\n')}

Notable Trends (vs previous period):
${trends.filter(t => t.isAnomaly).map(t => `⚠️ ${t.label}: ${t.changePct > 0 ? '+' : ''}${t.changePct}%`).join('\n') || 'No anomalies detected'}
`;

  const systemPrompt = `You are a senior product analyst for a bank. Based on the analytics data provided, generate exactly 5 concise, actionable executive insights.
Each insight should:
- Be a single clear sentence (max 25 words)
- Start with a specific observation or finding
- Include a number or percentage when relevant
- Sound like it was written by a human analyst, not a machine
- Focus on business impact, not technical details

Format: Return ONLY a JSON array of 5 strings. Example: ["Insight 1.", "Insight 2.", ...]`;

  let fullText = '';
  try {
    await streamChatCompletion(
      {
        apiKey,
        model: 'gpt-4o-mini',
        systemPrompt,
        messages: [{ role: 'user', content: summary }],
      },
      { onDelta: d => { fullText += d; } },
    );

    const jsonMatch = fullText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as unknown[];
      if (Array.isArray(parsed) && parsed.every(s => typeof s === 'string')) {
        return parsed as string[];
      }
    }
  } catch {
    // fallback to rule-based insights
  }

  // Rule-based fallback insights
  const fallbacks: string[] = [];
  const topTopic = topics[0];
  if (topTopic) fallbacks.push(`"${topTopic.displayName}" is the most common inquiry at ${topTopic.pct}% of all conversations.`);

  const risingTrend = trends.filter(t => t.direction === 'up' && t.isAnomaly)[0];
  if (risingTrend) fallbacks.push(`${risingTrend.label} surged ${risingTrend.changePct}% vs the previous ${days}-day period — warrants immediate attention.`);

  const topComplaint = complaints.find(c => c.count > 0 && c.severity === 'high');
  if (topComplaint) fallbacks.push(`${topComplaint.displayName} complaints are the highest-severity category with ${topComplaint.count} incidents.`);

  fallbacks.push(`AI containment rate stands at ${(kpi.containmentRate * 100).toFixed(1)}% — customers resolved ${Math.round(kpi.containmentRate * kpi.totalTurns)} queries without human escalation.`);
  fallbacks.push(`${kpi.totalSessions} unique customer sessions recorded over ${days} days with an average response latency of ${kpi.avgLatencyMs.toFixed(0)}ms.`);

  return fallbacks.slice(0, 5);
}
