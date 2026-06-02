// API contract types shared between widget and backend.
// Changing anything here is a breaking API change.

export type Lang = 'uz' | 'ru' | 'en';

export const SUPPORTED_LANGS: readonly Lang[] = ['uz', 'ru', 'en'] as const;

// ── /api/health ───────────────────────────────────────────────
export interface HealthResponse {
  status: 'ok';
  uptime_seconds: number;
  version: string;
}

// ── /api/widget-config/:tenant ────────────────────────────────
export interface WidgetConfigResponse {
  tenant_id: string;
  name: string;
  branding: {
    displayName: string;
    logoUrl: string | null;
    accentColor: string;
  };
  languages: {
    default: Lang;
    enabled: Lang[];
  };
  hotline: string;
  greeting: Record<Lang, string>;
}

// ── /api/session/new ──────────────────────────────────────────
export interface SessionNewRequest {
  tenant_id: string;
  user_meta?: Record<string, unknown>;
}

export interface SessionNewResponse {
  session_id: string;
}

// ── /api/chat (SSE) ───────────────────────────────────────────
export interface ChatRequest {
  tenant_id: string;
  session_id: string;
  message: string;
  language?: Lang;
}

export type ChatSseEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; escalation: boolean; message_id: string }
  | { type: 'error'; error: string; fallback: string };

// ── Generic API error shape ───────────────────────────────────
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
