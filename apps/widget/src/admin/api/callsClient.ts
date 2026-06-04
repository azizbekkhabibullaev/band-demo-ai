/**
 * VOC Call Analytics API client
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? '';

function token(): string | null {
  return localStorage.getItem('admin_token');
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const tok = token();
  const headers: Record<string, string> = {
    ...(tok ? { authorization: `Bearer ${tok}` } : {}),
    ...(opts?.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = '/admin/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type Priority  = 'low' | 'medium' | 'high' | 'critical';
export type CallStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CallRecord {
  id: string;
  filename: string;
  duration_seconds: number;
  language: string;
  transcript: string | null;
  summary: string | null;
  sentiment: Sentiment | null;
  sentiment_score: number | null;
  category: string | null;
  subcategory: string | null;
  priority: Priority | null;
  topics: string[];
  is_lead: boolean;
  lead_score: number;
  lead_interest: string | null;
  lead_id: string | null;
  lead_name?: string | null;
  lead_phone?: string | null;
  lead_status?: string | null;
  is_complaint: boolean;
  complaint_notes?: string | null;
  status: CallStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CallAnalytics {
  total: number;
  classified: number;
  commercial: number;
  complaints: number;
  avgDuration: number;
  positive: number;
  neutral: number;
  negative: number;
  sentimentBreakdown: { sentiment: string; count: number }[];
  topCategories: { category: string; count: number }[];
  days: number;
}

export interface CallTrend {
  category: string;
  current: number;
  previous: number;
  changePct: number;
  direction: 'up' | 'down' | 'stable';
  isAnomaly: boolean;
}

export interface CallTopics {
  topCategories: { category: string; count: number }[];
  topSubcategories: { subcategory: string; count: number }[];
  days: number;
}

export interface UploadedCall {
  callId: string;
  filename: string;
  status: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function uploadCalls(files: File[]): Promise<{ uploaded: UploadedCall[]; count: number }> {
  const form = new FormData();
  for (const file of files) form.append('file', file);
  return request('/api/admin/calls/upload', {
    method: 'POST',
    body: form,
    // Don't set content-type — browser sets it with boundary automatically
  });
}

export async function getCallsAnalytics(days = 30): Promise<CallAnalytics> {
  return request(`/api/admin/calls/analytics?days=${days}`);
}

export async function getCallsTrends(days = 14): Promise<{ trends: CallTrend[]; days: number }> {
  return request(`/api/admin/calls/trends?days=${days}`);
}

export async function getCallsTopics(days = 30): Promise<CallTopics> {
  return request(`/api/admin/calls/topics?days=${days}`);
}

export interface GetCallsParams {
  limit?: number;
  offset?: number;
  sentiment?: string;
  category?: string;
  priority?: string;
  language?: string;
  isLead?: boolean;
  isComplaint?: boolean;
  status?: string;
  search?: string;
  days?: number;
}

export async function getCalls(params: GetCallsParams = {}): Promise<{ calls: CallRecord[]; total: number }> {
  const q = new URLSearchParams();
  if (params.limit)       q.set('limit',       String(params.limit));
  if (params.offset)      q.set('offset',      String(params.offset));
  if (params.sentiment)   q.set('sentiment',   params.sentiment);
  if (params.category)    q.set('category',    params.category);
  if (params.priority)    q.set('priority',    params.priority);
  if (params.language)    q.set('language',    params.language);
  if (params.status)      q.set('status',      params.status);
  if (params.isLead)      q.set('isLead',      'true');
  if (params.isComplaint) q.set('isComplaint', 'true');
  if (params.search)      q.set('search',      params.search);
  if (params.days)        q.set('days',        String(params.days));
  return request(`/api/admin/calls?${q}`);
}

export async function getCall(id: string): Promise<{ call: CallRecord }> {
  return request(`/api/admin/calls/${id}`);
}

export async function deleteCall(id: string): Promise<void> {
  await request(`/api/admin/calls/${id}`, { method: 'DELETE' });
}
