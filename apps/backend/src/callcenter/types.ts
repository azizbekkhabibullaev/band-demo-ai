/**
 * Call Center Intelligence — Extension Points
 * Enterprise Banking AI Platform
 *
 * Defines the interface layer for future call-center integrations:
 *   - Audio transcription (Whisper / AssemblyAI)
 *   - Call classification
 *   - Complaint detection
 *   - Incident escalation
 *   - Agent assist (real-time overlay)
 *
 * These are INTERFACES and STUBS — plug in real implementations
 * by replacing the stub providers below.
 */

// ─── Core domain types ────────────────────────────────────────────────────────

export type CallChannel = 'phone' | 'chat' | 'email' | 'social';
export type CallSentiment = 'positive' | 'neutral' | 'frustrated' | 'angry' | 'distressed';
export type CallCategory =
  | 'product_inquiry'
  | 'technical_support'
  | 'complaint'
  | 'fraud_report'
  | 'account_management'
  | 'payment_issue'
  | 'escalation_request'
  | 'other';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface CallRecord {
  id: string;
  tenantId: string;
  channel: CallChannel;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds?: number;
  transcript?: string;
  language?: string;
  customerId?: string;
  agentId?: string;
  classification?: CallClassification;
  incidents?: Incident[];
}

export interface CallClassification {
  category: CallCategory;
  sentiment: CallSentiment;
  confidence: number;
  topics: string[];
  summary: string;
  requiresFollowUp: boolean;
  suggestedResponse?: string;
}

export interface Incident {
  id: string;
  callId: string;
  severity: IncidentSeverity;
  type: 'fraud' | 'complaint' | 'technical' | 'regulatory' | 'safety';
  description: string;
  detectedAt: Date;
  resolved: boolean;
  assignedTo?: string;
}

// ─── Transcription provider interface ────────────────────────────────────────

export interface TranscriptionProvider {
  name: string;
  transcribe(audioBuffer: Buffer, lang?: string): Promise<TranscriptionResult>;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  segments?: TranscriptionSegment[];
  durationMs?: number;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  confidence: number;
}

// ─── Classification provider interface ───────────────────────────────────────

export interface ClassificationProvider {
  name: string;
  classify(transcript: string, lang: string): Promise<CallClassification>;
}

// ─── Incident detector interface ──────────────────────────────────────────────

export interface IncidentDetector {
  name: string;
  detect(transcript: string, classification: CallClassification): Promise<Incident[]>;
}

// ─── Agent Assist interface ───────────────────────────────────────────────────

export interface AgentAssist {
  /** Called after each customer utterance; returns real-time suggestion for the agent */
  suggest(
    transcript: string,
    context: CallRecord,
  ): Promise<AgentSuggestion>;
}

export interface AgentSuggestion {
  suggestedReply?: string;
  relevantKbArticles?: { title: string; url: string }[];
  productRecommendations?: string[];
  escalationRecommended: boolean;
  escalationReason?: string;
}

// ─── Call center service (orchestrates providers) ─────────────────────────────

export interface CallCenterService {
  transcriptionProvider?: TranscriptionProvider;
  classificationProvider?: ClassificationProvider;
  incidentDetector?: IncidentDetector;
  agentAssist?: AgentAssist;

  processCall(callId: string, audioBuffer?: Buffer): Promise<CallRecord>;
  getCallRecord(callId: string): Promise<CallRecord | null>;
  listIncidents(tenantId: string, severity?: IncidentSeverity): Promise<Incident[]>;
}

// ─── Stub implementation (replace with real providers in production) ──────────

export class StubCallCenterService implements CallCenterService {
  async processCall(callId: string): Promise<CallRecord> {
    return {
      id: callId,
      tenantId: 'unknown',
      channel: 'phone',
      startedAt: new Date(),
      classification: {
        category: 'other',
        sentiment: 'neutral',
        confidence: 0,
        topics: [],
        summary: 'Stub implementation — configure real providers',
        requiresFollowUp: false,
      },
    };
  }

  async getCallRecord(): Promise<null> { return null; }
  async listIncidents(): Promise<Incident[]> { return []; }
}

// ─── Sentiment keywords for rule-based detection (Phase 1 bootstrap) ─────────

export const FRUSTRATION_SIGNALS: Record<string, RegExp[]> = {
  ru: [
    /не\s*работает/i, /ужасно/i, /безобразие/i, /требую/i, /жалоб/i,
    /мошенничество/i, /украли/i, /обманули/i, /верните/i,
  ],
  uz: [
    /ishlamayapti/i, /dahshatli/i, /shikoyat/i, /qaytaring/i,
    /firibgarlik/i, /o'g'irlab/i,
  ],
};

export function detectSentiment(text: string, lang: string): CallSentiment {
  const signals = FRUSTRATION_SIGNALS[lang] ?? FRUSTRATION_SIGNALS['ru']!;
  const matches = signals.filter(p => p.test(text)).length;
  if (matches >= 3) return 'angry';
  if (matches >= 2) return 'frustrated';
  if (matches >= 1) return 'neutral'; // slight tension but ok
  return 'positive';
}
