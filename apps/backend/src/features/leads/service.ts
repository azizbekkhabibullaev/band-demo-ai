/**
 * Lead Generation Service — Banking Sales & Intelligence Platform
 */

import { getPool } from '../../db/client.js';

export type LeadType = 'callback' | 'consultation' | 'escalation' | 'product_interest';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'closed';

export interface CreateLeadParams {
  tenantId: string;
  sessionId?: string | undefined;
  leadType: LeadType;
  lang: string;
  fullName?: string | undefined;
  phone?: string | undefined;
  preferredTime?: string | undefined;
  productInterest?: string | undefined;
  interestType?: string | undefined;
  message?: string | undefined;
  intentName?: string | undefined;
  routingTier?: string | undefined;
  confidence?: number | undefined;
}

export interface Lead {
  id: string;
  tenantId: string;
  sessionId: string | null;
  leadType: LeadType;
  status: LeadStatus;
  fullName: string | null;
  phone: string | null;
  preferredTime: string | null;
  productInterest: string | null;
  interestType: string | null;
  message: string | null;
  lang: string;
  intentName: string | null;
  routingTier: string | null;
  confidence: number | null;
  leadScore: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Lead scoring ─────────────────────────────────────────────────────────────

function computeLeadScore(params: CreateLeadParams): number {
  let score = 0;
  // Phone submitted = strong intent
  if (params.phone) score += 45;
  // Named themselves = personal engagement
  if (params.fullName && params.fullName.trim().length > 1) score += 15;
  // Specific product interest
  if (params.productInterest || params.interestType) score += 15;
  // Typed a detailed message
  if (params.message && params.message.length > 40) score += 10;
  // High AI confidence in intent
  if (params.confidence && params.confidence > 0.7) score += 10;
  // Callback type = strongest intent signal
  if (params.leadType === 'callback') score += 5;
  return Math.min(score, 100);
}

export async function createLead(params: CreateLeadParams): Promise<Lead> {
  const pool = getPool();
  const leadScore = computeLeadScore(params);
  const { rows } = await pool.query<Record<string, unknown>>(
    `INSERT INTO leads (
       tenant_id, session_id, lead_type, lang,
       full_name, phone, preferred_time, product_interest, interest_type,
       message, intent_name, routing_tier, confidence, lead_score
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      params.tenantId,
      params.sessionId ?? null,
      params.leadType,
      params.lang,
      params.fullName ?? null,
      params.phone ?? null,
      params.preferredTime ?? null,
      params.productInterest ?? null,
      params.interestType ?? null,
      params.message ?? null,
      params.intentName ?? null,
      params.routingTier ?? null,
      params.confidence ?? null,
      leadScore,
    ],
  );
  return mapLead(rows[0]!);
}

export async function getLeads(
  tenantId: string,
  opts?: { status?: LeadStatus; limit?: number; offset?: number },
): Promise<Lead[]> {
  const pool = getPool();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  let sql = `SELECT * FROM leads WHERE tenant_id = $1`;
  const params: unknown[] = [tenantId];

  if (opts?.status) {
    params.push(opts.status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ` ORDER BY lead_score DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const { rows } = await pool.query(sql, params);
  return rows.map(mapLead);
}

export async function updateLeadStatus(
  id: string,
  tenantId: string,
  status: LeadStatus,
): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE leads SET status = $1, updated_at = now()
     WHERE id = $2 AND tenant_id = $3`,
    [status, id, tenantId],
  );
  return (rowCount ?? 0) > 0;
}

// ─── Product interest normaliser ──────────────────────────────────────────────

const PRODUCT_KEYWORDS: Record<string, RegExp> = {
  'Ипотека':        /ипотек|ipoteka|mortgage/i,
  'Автокредит':     /автокредит|авто\s*кредит|avtokredit|auto.*loan|car.*loan/i,
  'Кредит':         /кредит|kredit|loan|qarz/i,
  'Депозит/Вклад':  /депозит|вклад|deposit|hisob/i,
  'Карта':          /карт[а-я]|karta|card/i,
  'Инвестиции':     /инвест|invest/i,
  'Перевод':        /перевод|o.tkazma|transfer/i,
  'Мобильный банк': /мобильн|mobile|app|ilova/i,
};

export function detectProductInterest(text: string): string | null {
  for (const [name, rx] of Object.entries(PRODUCT_KEYWORDS)) {
    if (rx.test(text)) return name;
  }
  return null;
}

// ─── Lead intent detection ────────────────────────────────────────────────────

const CALLBACK_SIGNALS: RegExp[] = [
  /перезвон|callback|call\s*back|qo'ng'iroq/i,
  /оставьте\s*номер|номер\s*телефон|raqam/i,
  /свяжитесь|bog'lan|contact/i,
];

const CONSULTATION_SIGNALS: RegExp[] = [
  /консультац|maslahat|consult/i,
  /специалист|mutaxassis|specialist/i,
  /подобрать|tanlash|recommend/i,
];

export function detectLeadIntent(
  userMessage: string,
  assistantMessage: string,
): LeadType | null {
  const combined = userMessage + ' ' + assistantMessage;
  if (CALLBACK_SIGNALS.some(p => p.test(combined))) return 'callback';
  if (CONSULTATION_SIGNALS.some(p => p.test(combined))) return 'consultation';
  return null;
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

function mapLead(row: Record<string, unknown>): Lead {
  return {
    id: row['id'] as string,
    tenantId: row['tenant_id'] as string,
    sessionId: row['session_id'] as string | null,
    leadType: row['lead_type'] as LeadType,
    status: row['status'] as LeadStatus,
    fullName: row['full_name'] as string | null,
    phone: row['phone'] as string | null,
    preferredTime: row['preferred_time'] as string | null,
    productInterest: row['product_interest'] as string | null,
    interestType: row['interest_type'] as string | null,
    message: row['message'] as string | null,
    lang: row['lang'] as string,
    intentName: row['intent_name'] as string | null,
    routingTier: row['routing_tier'] as string | null,
    confidence: row['confidence'] as number | null,
    leadScore: (row['lead_score'] as number) ?? 0,
    createdAt: row['created_at'] as Date,
    updatedAt: row['updated_at'] as Date,
  };
}
