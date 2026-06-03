import type { FastifyInstance } from 'fastify';
import type { ChatRequest, Lang } from '@bank-chatbot/shared';
import { SUPPORTED_LANGS } from '@bank-chatbot/shared';
import type { ServerResponse } from 'node:http';
import { orchestrate } from '../rag/orchestrator.js';
import { buildSystemPrompt, buildConversationMessages } from '../rag/prompt.js';
import { checkOutput } from '../rag/post-filter.js';
import { checkDomainRelevance, getOffTopicResponse } from '../rag/domain-guard.js';
import { streamChatCompletion } from '../llm/openai.js';
import { getSessionWithHistory, insertMessage } from '../db/queries.js';
import { checkSessionRateLimit } from '../middleware/rate-limit.js';
import { trackEvent } from '../analytics/tracker.js';
import { getOrCreateContext, updateContext, summarizeContext } from '../memory/context.js';
import { extractGoal, buildRecommendations, renderRecommendations } from '../features/recommendations/engine.js';

const FALLBACK: Record<string, string> = {
  uz: "Texnik xatolik yuz berdi. Iltimos, 1233 ga qo'ng'iroq qiling.",
  ru: 'Произошла техническая ошибка. Пожалуйста, позвоните: 1233.',
  en: 'A technical error occurred. Please call our hotline.',
};

function sseEvent(raw: ServerResponse, event: object): void {
  raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

// Intents that trigger product recommendations
const RECOMMENDATION_INTENTS = new Set([
  'depozit', 'kredit_ariza', 'kredit_tatil', 'karta_chiqarish', 'hisob_ochish',
]);

export async function chatRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ChatRequest }>('/api/chat', async (req, reply) => {
    // ── Pre-hijack phase: return normal HTTP errors ──────────────
    if (!req.tenant) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
    }

    const tenant = req.tenant;
    const { session_id, message, language } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.code(400).send({ error: { code: 'invalid_message', message: 'Message is required' } });
    }
    const maxLen = tenant.config.limits.maxMessageLength;
    if (message.length > maxLen) {
      return reply
        .code(400)
        .send({ error: { code: 'message_too_long', message: `Message exceeds ${maxLen} characters` } });
    }

    const sessionData = await getSessionWithHistory(session_id, tenant.id);
    if (!sessionData) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Session not found' } });
    }

    if (!checkSessionRateLimit(session_id, tenant.config.limits.messagesPerSessionPer10Min)) {
      return reply
        .code(429)
        .send({ error: { code: 'session_rate_limited', message: 'Too many messages in this session' } });
    }

    // Resolve forced language from request
    const enabledLangs = tenant.config.languages.enabled as Lang[];
    const forcedLang =
      language &&
      SUPPORTED_LANGS.includes(language as Lang) &&
      enabledLangs.includes(language as Lang)
        ? (language as Lang)
        : undefined;

    // ── Hijack: take over the raw response for SSE ───────────────
    reply.hijack();
    const raw = reply.raw;
    const corsOrigin = req.headers.origin;
    const responseHeaders: Record<string, string> = {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
      'x-request-id': req.requestId,
    };
    if (typeof corsOrigin === 'string') responseHeaders['access-control-allow-origin'] = corsOrigin;
    raw.writeHead(200, responseHeaders);

    const startTime = Date.now();
    const defaultLang = (tenant.config.languages.default as Lang) ?? 'ru';

    try {
      // Persist user message
      await insertMessage({
        sessionId: session_id,
        tenantId: tenant.id,
        role: 'user',
        content: message,
        lang: forcedLang ?? defaultLang,
      });

      // ── Domain guard (Layer 1) ───────────────────────────────────
      const domainCheck = checkDomainRelevance(message);
      if (!domainCheck.allowed) {
        const guardLang = forcedLang ?? defaultLang;
        req.appLog.info('Domain guard blocked query', {
          tenant_id: tenant.id,
          session_id,
          blocked_by: domainCheck.blockedBy,
        });
        const offTopicText = getOffTopicResponse(guardLang);
        // Stream as SSE deltas so the widget renders it like a normal response
        for (const char of offTopicText) {
          sseEvent(raw, { type: 'delta', text: char });
        }
        sseEvent(raw, {
          type: 'done',
          escalation: false,
          meta: { routing_tier: 'domain_guard', lang: guardLang },
        });
        raw.end();
        return;
      }

      // ── Load customer context memory ─────────────────────────────
      let customerCtx = null;
      try {
        customerCtx = await getOrCreateContext(session_id, tenant.id);
      } catch { /* non-critical */ }

      // ── Run the full intelligence pipeline ───────────────────────
      const result = await orchestrate(tenant, message, forcedLang);
      const resolvedLang = result.lang;

      req.appLog.info('Orchestrator result', {
        tenant_id: tenant.id,
        session_id,
        lang: resolvedLang,
        routing_tier: result.routingTier,
        confidence: result.confidence,
        intent: result.intent?.name,
        faq_confidence: result.faqHit?.confidence,
        kb_chunks: result.kbChunks.length,
      });

      // ── Build recommendation context ─────────────────────────────
      let recommendationMd = '';
      if (result.intent && RECOMMENDATION_INTENTS.has(result.intent.name)) {
        try {
          const goal = extractGoal(result.intent.name, message, resolvedLang);
          const recs = buildRecommendations(goal);
          if (recs.recommendations.length > 0) {
            recommendationMd = renderRecommendations(recs, resolvedLang);
          }
        } catch { /* non-critical */ }
      }

      // ── Build system prompt ──────────────────────────────────────
      const contextSummary = customerCtx ? summarizeContext(customerCtx) : '';
      const systemPrompt = buildSystemPrompt(tenant, resolvedLang, result.kbChunks, {
        faqHit: result.faqHit,
        kbChunks: result.kbChunks,
        intent: result.intent,
        routingTier: result.routingTier,
        confidence: result.confidence,
        customerContextSummary: contextSummary,
        recommendationMd,
      });

      const conversationMessages = buildConversationMessages(
        sessionData.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        message,
      );

      // ── Stream from OpenAI ───────────────────────────────────────
      const apiKey = process.env.OPENAI_API_KEY ?? '';
      let fullText = '';
      const streamResult = await streamChatCompletion(
        { apiKey, model: tenant.config.model.chat, systemPrompt, messages: conversationMessages },
        {
          onDelta: text => {
            fullText += text;
            sseEvent(raw, { type: 'delta', text });
          },
        },
      );

      // Post-filter
      const filterResult = checkOutput(fullText);
      if (!filterResult.ok) {
        req.appLog.warn('Post-filter triggered', { reason: filterResult.reason });
        sseEvent(raw, {
          type: 'error',
          error: 'content_filtered',
          fallback: FALLBACK[resolvedLang] ?? FALLBACK['ru']!,
        });
        raw.end();
        return;
      }

      const escalation = /ESCALATION_NEEDED/.test(fullText);
      const latencyMs = Date.now() - startTime;

      const { id: messageId } = await insertMessage({
        sessionId: session_id,
        tenantId: tenant.id,
        role: 'assistant',
        content: fullText,
        lang: resolvedLang,
        retrievedChunkIds: result.kbChunks.map(c => c.id),
        retrievalScores: result.kbChunks.map(c => c.final_score),
        promptTokens: streamResult.promptTokens,
        completionTokens: streamResult.completionTokens,
        latencyMs,
        model: tenant.config.model.chat,
        escalationSignaled: escalation,
      });

      // ── Track analytics events (fire-and-forget) ─────────────────
      const intentNameStr: string | undefined = result.intent?.name ?? undefined;
      trackEvent({
        tenantId: tenant.id,
        sessionId: session_id,
        messageId,
        eventType: 'chat_turn',
        lang: resolvedLang,
        routingTier: result.routingTier,
        confidence: result.confidence,
        intentName: intentNameStr,
        faqId: result.faqHit?.faq_id ?? undefined,
        kbChunkIds: result.kbChunks.map(c => c.id),
        latencyMs,
        promptTokens: streamResult.promptTokens ?? undefined,
        completionTokens: streamResult.completionTokens ?? undefined,
      });

      if (result.faqHit && result.faqHit.confidence >= 0.75) {
        trackEvent({ tenantId: tenant.id, sessionId: session_id, messageId, eventType: 'faq_hit',
          lang: resolvedLang, faqId: result.faqHit.faq_id, confidence: result.faqHit.confidence });
      }
      if (result.kbChunks.length > 0) {
        trackEvent({ tenantId: tenant.id, sessionId: session_id, messageId, eventType: 'kb_hit',
          lang: resolvedLang, kbChunkIds: result.kbChunks.map(c => c.id) });
      }
      if (result.intent && result.intent.intent_id !== 'INT_022') {
        trackEvent({ tenantId: tenant.id, sessionId: session_id, messageId, eventType: 'intent_detected',
          lang: resolvedLang, intentName: result.intent.name, confidence: result.confidence });
      }
      if (escalation) {
        trackEvent({ tenantId: tenant.id, sessionId: session_id, messageId, eventType: 'escalation',
          lang: resolvedLang, routingTier: result.routingTier });
      }
      if (recommendationMd) {
        trackEvent({ tenantId: tenant.id, sessionId: session_id, messageId,
          eventType: 'recommendation_shown', intentName: intentNameStr });
      }

      // ── Update customer context memory ────────────────────────────
      const isProductIntent = intentNameStr !== undefined && RECOMMENDATION_INTENTS.has(intentNameStr);
      updateContext(session_id, tenant.id, {
        detectedLang: resolvedLang,
        newIntent: intentNameStr,
        newProductInterest: isProductIntent ? intentNameStr : undefined,
        lastTopic: result.kbChunks[0]?.category ?? intentNameStr,
        escalated: escalation ? true : undefined,
      }).catch(() => { /* non-critical */ });

      req.appLog.info('Chat turn complete', {
        tenant_id: tenant.id, session_id, lang: resolvedLang,
        retrieved_chunks: result.kbChunks.length,
        routing_tier: result.routingTier,
        prompt_tokens: streamResult.promptTokens,
        completion_tokens: streamResult.completionTokens,
        model: tenant.config.model.chat, latency_ms: latencyMs, escalation,
      });

      sseEvent(raw, {
        type: 'done',
        escalation,
        message_id: messageId,
        meta: {
          routing_tier: result.routingTier,
          confidence: result.confidence,
          lang: resolvedLang,
        },
      });
      raw.end();
    } catch (err) {
      req.appLog.error('Chat route unhandled error', { err });
      try {
        sseEvent(raw, {
          type: 'error',
          error: 'internal_error',
          fallback: FALLBACK[defaultLang] ?? FALLBACK['ru']!,
        });
        raw.end();
      } catch { /* raw may already be closed */ }
    }
  });
}
