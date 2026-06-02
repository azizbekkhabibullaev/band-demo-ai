/**
 * Lead Generation Service — Enterprise Banking AI Platform
 *
 * Captures structured lead records from chat sessions.
 * Supports callback, consultation, escalation, and product_interest leads.
 */

import { getPool } from '../../db/client.js';

export type LeadType = 'callback' | 'consultation' | 'escalation' | 'product_interest';
export type LeadStatus = 'new' | 'contacted' | 'converted' | 'closed';

export interface CreateLeadParams {
  tenantId: string;
  sessionId?: string | undefined;
  leadType: LeadType;
  lang: string;
  phone?: string | undefined;
  preferredTime?: string | undefined;
  productInterest?: string | undefined;
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
  phone: string | null;
  preferredTime: string | null;
  productInterest: string | null;
  message: string | null;
  lang: string;
  intentName: string | null;
  routingTier: string | null;
  confidence: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function createLead(params: CreateLeadParams): Promise<Lead> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: string; tenant_id: string; session_id: string | null;
    lead_type: string; status: string; phone: string | null;
    preferred_time: string | null; product_interest: string | null;
    message: string | null; lang: string; intent_name: string | null;
    routing_tier: string | null; confidence: number | null;
    created_at: Date; updated_at: Date;
  }>(
    `INSERT INTO leads (
       tenant_id, session_id, lead_type, lang,
       phone, preferred_time, product_interest, message,
       intent_name, routing_tier, confidence
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      params.tenantId,
      params.sessionId ?? null,
      params.leadType,
      params.lang,
      params.phone ?? null,
      params.preferredTime ?? null,
      params.productInterest ?? null,
      params.message ?? null,
      params.intentName ?? null,
      params.routingTier ?? null,
      params.confidence ?? null,
    ],
  );
  const row = rows[0]!;
  return mapLead(row);
}

export async function getLeads(
  tenantId: string,
  opts?: { status?: LeadStatus; limit?: number; offset?: number },
): Promise<Lead[]> {
  const pool = getPool();
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  let sql = `
    SELECT * FROM leads
    WHERE tenant_id = $1
  `;
  const params: unknown[] = [tenantId];

  if (opts?.status) {
    params.push(opts.status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
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

// ─── Lead detection from chat messages ────────────────────────────────────────

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
    phone: row['phone'] as string | null,
    preferredTime: row['preferred_time'] as string | null,
    productInterest: row['product_interest'] as string | null,
    message: row['message'] as string | null,
    lang: row['lang'] as string,
    intentName: row['intent_name'] as string | null,
    routingTier: row['routing_tier'] as string | null,
    confidence: row['confidence'] as number | null,
    createdAt: row['created_at'] as Date,
    updatedAt: row['updated_at'] as Date,
  };
}
