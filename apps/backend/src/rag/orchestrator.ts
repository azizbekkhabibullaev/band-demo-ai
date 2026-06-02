import type { Tenant } from '../tenants/types.js';
import type { Lang } from '@bank-chatbot/shared';
import { embedText } from './embed.js';
import { retrieveChunks, type RetrievedChunk } from './retrieve.js';
import { lookupFaq, type FaqResult } from './faq-engine.js';
import { detectIntent, type DetectedIntent } from './intent-engine.js';
import { detectLanguage } from '../lang/detect.js';

export interface OrchestratorResult {
  lang: Lang;
  intent: DetectedIntent | null;
  faqHit: FaqResult | null;
  kbChunks: RetrievedChunk[];
  // Routing decision
  routingTier: 'faq_direct' | 'kb_context' | 'llm_only' | 'escalate';
  confidence: number;
  embedding: number[];
}

const TIER_THRESHOLDS = {
  faqDirect: 0.88,   // FAQ confidence >= this → use FAQ answer directly
  kbContext: 0.50,   // KB cosine score >= this → strong KB context
  escalate: 0.25,    // Overall confidence < this → suggest escalation
};

export async function orchestrate(
  tenant: Tenant,
  query: string,
  forcedLang?: Lang,
): Promise<OrchestratorResult> {
  // 1. Language detection
  const detectedLang = forcedLang ?? (detectLanguage(query) as Lang);
  const enabledLangs = tenant.config.languages.enabled as Lang[];
  const resolvedLang: Lang = enabledLangs.includes(detectedLang)
    ? detectedLang
    : (tenant.config.languages.default as Lang);

  // 2. Embed query (single call, reused everywhere)
  let embedding: number[] = [];
  try {
    embedding = await embedText(query, tenant.config.model.embedding);
  } catch {
    // Stub: zeros — retrieval will fall back to keyword-only scoring
    embedding = new Array(1536).fill(0);
  }

  // 3. Parallel: FAQ lookup + KB retrieval + intent detection
  const [faqResults, kbChunks, intents] = await Promise.all([
    lookupFaq(tenant.id, query, embedding),
    retrieveChunks({
      tenantId: tenant.id,
      lang: resolvedLang,
      embedding,
      query,
      topK: 5,
      threshold: 0.25,
    }),
    detectIntent(tenant.id, query),
  ]);

  const topFaq = faqResults[0] ?? null;
  const topIntent = intents[0] ?? null;
  const topKbScore = kbChunks[0]?.final_score ?? 0;

  // 4. Routing decision
  let routingTier: OrchestratorResult['routingTier'];
  let confidence: number;

  if (topFaq && topFaq.confidence >= TIER_THRESHOLDS.faqDirect) {
    routingTier = 'faq_direct';
    confidence = topFaq.confidence;
  } else if (
    topKbScore >= TIER_THRESHOLDS.kbContext ||
    (topFaq && topFaq.confidence >= 0.6)
  ) {
    routingTier = 'kb_context';
    confidence = Math.max(topKbScore, topFaq?.confidence ?? 0);
  } else if (
    topKbScore > TIER_THRESHOLDS.escalate ||
    (topFaq && topFaq.confidence > TIER_THRESHOLDS.escalate)
  ) {
    routingTier = 'llm_only';
    confidence = Math.max(topKbScore, topFaq?.confidence ?? 0);
  } else {
    routingTier = 'escalate';
    confidence = topKbScore;
  }

  return {
    lang: resolvedLang,
    intent: topIntent,
    faqHit: topFaq,
    kbChunks,
    routingTier,
    confidence,
    embedding,
  };
}
