import type { WidgetConfigResponse, ChatSseEvent } from '../types.ts';

// Active tenant — reads from env first, falls back to ipoteka-bank.
const TENANT_ID = import.meta.env.VITE_TENANT_ID ?? 'ipoteka-bank';
// Empty string = relative paths (dev proxy). Set VITE_API_BASE_URL for production.
const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export async function fetchWidgetConfig(): Promise<WidgetConfigResponse> {
  const res = await fetch(`${BASE}/api/widget-config/${TENANT_ID}`);
  if (!res.ok) throw new Error(`widget-config ${res.status}`);
  return res.json() as Promise<WidgetConfigResponse>;
}

export async function createSession(): Promise<string> {
  const res = await fetch(`${BASE}/api/session/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID }),
  });
  if (!res.ok) throw new Error(`session/new ${res.status}`);
  const data = (await res.json()) as { session_id: string };
  return data.session_id;
}

export interface LeadPayload {
  phone: string;
  fullName?: string;
  interestType?: string;
  sessionId?: string;
  lang?: string;
}

export async function submitLead(payload: LeadPayload): Promise<void> {
  await fetch(`${BASE}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: TENANT_ID,
      phone: payload.phone,
      full_name: payload.fullName || undefined,
      interest_type: payload.interestType || undefined,
      session_id: payload.sessionId || undefined,
      language: payload.lang || 'ru',
      lead_type: 'callback',
    }),
  });
}

export interface QuickActionClickPayload {
  sessionId?:  string;
  messageId?:  string;
  intent?:     string;
  lang?:       string;
  chipLabel:   string;
  chipType?:   string;
}

export async function trackQuickActionClick(payload: QuickActionClickPayload): Promise<void> {
  await fetch(`${BASE}/api/analytics/quick-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id:  TENANT_ID,
      session_id: payload.sessionId,
      message_id: payload.messageId,
      intent:     payload.intent,
      lang:       payload.lang,
      chip_label: payload.chipLabel,
      chip_type:  payload.chipType,
    }),
  });
}

export async function streamChat(
  sessionId: string,
  message: string,
  callbacks: {
    onDelta: (text: string) => void;
    onDone: (event: Extract<ChatSseEvent, { type: 'done' }>) => void;
    onError: (event: Extract<ChatSseEvent, { type: 'error' }>) => void;
  },
  lang?: string,
): Promise<void> {
  const body: Record<string, unknown> = { tenant_id: TENANT_ID, session_id: sessionId, message };
  if (lang) body.language = lang;

  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    callbacks.onError({ type: 'error', error: `HTTP ${res.status}`, fallback: 'Something went wrong. Please try again.' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        let event: ChatSseEvent;
        try {
          event = JSON.parse(json) as ChatSseEvent;
        } catch {
          callbacks.onError({ type: 'error', error: 'Malformed SSE frame', fallback: 'Something went wrong. Please try again.' });
          return;
        }
        if (event.type === 'delta') callbacks.onDelta(event.text);
        else if (event.type === 'done') callbacks.onDone(event);
        else if (event.type === 'error') callbacks.onError(event);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
