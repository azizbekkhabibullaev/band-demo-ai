/**
 * Admin API client — auto-injects JWT from localStorage.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL as string ?? '';

function token(): string | null {
  return localStorage.getItem('admin_token');
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const tok = token();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(tok ? { authorization: `Bearer ${tok}` } : {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string> ?? {}) } });
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

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(username: string, password: string): Promise<{ token: string; tenant: string }> {
  const tenant = import.meta.env.VITE_TENANT_ID as string ?? 'ipoteka-bank';
  return request('/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, tenant }),
  });
}

export async function verifyToken(): Promise<boolean> {
  try {
    await request('/api/admin/auth/verify');
    return true;
  } catch {
    return false;
  }
}

// ─── Dashboard / intelligence ────────────────────────────────────────────────

export interface KpiSnapshot {
  totalSessions: number;
  totalTurns: number;
  uniqueSessionsToday: number;
  containmentRate: number;
  leadRate: number;
  avgLatencyMs: number;
  avgConfidence: number;
  escalationsOpen: number;
}

export interface TopicStat {
  topic: string;
  displayName: string;
  count: number;
  pct: number;
  trend: 'up' | 'down' | 'stable';
  trendPct: number;
}

export interface TrendItem {
  label: string;
  current: number;
  previous: number;
  changePct: number;
  direction: 'up' | 'down' | 'stable';
  isAnomaly: boolean;
}

export interface VolumePoint {
  date: string;
  turns: number;
  sessions: number;
  escalations: number;
}

export interface Escalation {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'under_review' | 'resolved';
  triggerCount: number;
  autoDetected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeadFunnel {
  new: number;
  contacted: number;
  qualified: number;
  converted: number;
  closed: number;
  hot: number;   // score >= 90
  warm: number;  // score 70-89
  total: number;
}

export interface DashboardData {
  kpi: KpiSnapshot;
  topics: TopicStat[];
  trends: TrendItem[];
  volume: VolumePoint[];
  escalations: Escalation[];
  leadFunnel?: LeadFunnel;
  days: number;
}

export async function getDashboard(days = 7): Promise<DashboardData> {
  return request(`/api/admin/intelligence/dashboard?days=${days}`);
}

export async function getTopics(days = 7): Promise<{ topics: TopicStat[] }> {
  return request(`/api/admin/intelligence/topics?days=${days}`);
}

export async function getComplaints(days = 7) {
  return request<{ complaints: ComplaintStat[] }>(`/api/admin/intelligence/complaints?days=${days}`);
}

export interface ComplaintStat {
  category: string;
  displayName: string;
  count: number;
  pct: number;
  severity: 'low' | 'medium' | 'high';
  trend: 'up' | 'down' | 'stable';
}

export async function getTrends(days = 7): Promise<{ trends: TrendItem[] }> {
  return request(`/api/admin/intelligence/trends?days=${days}`);
}

export async function getInsights(days = 7): Promise<{ insights: string[] }> {
  return request(`/api/admin/intelligence/insights?days=${days}`);
}

// ─── Conversations ────────────────────────────────────────────────────────────

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

export async function getConversations(opts?: { limit?: number; offset?: number; lang?: string; search?: string }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.offset) params.set('offset', String(opts.offset));
  if (opts?.lang) params.set('lang', opts.lang);
  if (opts?.search) params.set('search', opts.search);
  return request<{ conversations: ConversationSummary[]; total: number }>(`/api/admin/conversations?${params}`);
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  lang: string;
  created_at: string;
  escalation_signaled: boolean;
}

export async function getConversationMessages(sessionId: string): Promise<{ messages: ChatMessage[] }> {
  return request(`/api/admin/conversations/${sessionId}/messages`);
}

// ─── Leads ────────────────────────────────────────────────────────────────────

export interface Lead {
  id: string;
  sessionId: string | null;
  leadType: string;
  status: string;
  fullName: string | null;
  phone: string | null;
  productInterest: string | null;
  interestType: string | null;
  message: string | null;
  lang: string;
  intentName: string | null;
  leadScore: number;
  createdAt: string;
}

export async function getLeads(opts?: { status?: string; limit?: number }): Promise<{ leads: Lead[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.limit) params.set('limit', String(opts.limit));
  return request(`/api/admin/leads?${params}`);
}

export async function updateLeadStatus(id: string, status: string): Promise<void> {
  await request(`/api/admin/leads/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ─── Escalations ─────────────────────────────────────────────────────────────

export async function getEscalations(status?: string): Promise<{ escalations: Escalation[] }> {
  const params = status ? `?status=${status}` : '';
  return request(`/api/admin/escalations${params}`);
}

export async function patchEscalation(id: string, status: string, notes?: string): Promise<void> {
  await request(`/api/admin/escalations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  });
}

export async function runEscalationEngine(): Promise<{ created: number }> {
  return request('/api/admin/escalations/run-engine', { method: 'POST', body: '{}' });
}

// ─── Intents ──────────────────────────────────────────────────────────────────

export interface IntentEntry {
  intent_id: string;
  name: string;
  display_name_uz: string;
  display_name_ru: string;
  category: string;
  kb_count: number;
  example_count: number;
}

export async function getIntents(): Promise<{ intents: IntentEntry[] }> {
  return request('/api/admin/intents');
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export async function getStats() {
  return request('/api/admin/stats');
}
