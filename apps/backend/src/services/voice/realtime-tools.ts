/**
 * Realtime Voice Tool Handlers — Phase 3
 *
 * Each handler maps an OpenAI Realtime function call to existing backend services.
 * No new business logic — purely wires existing orchestrator, leads, intents, etc.
 */

import { orchestrate } from '../../rag/orchestrator.js';
import { createLead } from '../../features/leads/service.js';
import { detectIntent } from '../../rag/intent-engine.js';
import { extractGoal, buildRecommendations, renderRecommendations } from '../../features/recommendations/engine.js';
import { getPool } from '../../db/client.js';
import type { Tenant } from '../../tenants/types.js';
import type { LeadType } from '../../features/leads/service.js';

export interface ToolCallArgs {
  [key: string]: unknown;
}

// ── Individual tool handlers ──────────────────────────────────────────────────

async function searchBankKnowledge(args: ToolCallArgs, tenant: Tenant): Promise<string> {
  const query = String(args['query'] ?? '');
  if (!query.trim()) return 'Уточните вопрос.';

  try {
    const result = await orchestrate(tenant, query, 'ru');

    const parts: string[] = [];

    if (result.faqHit && result.faqHit.confidence >= 0.7) {
      parts.push(`ОТВЕТ ИЗ FAQ: ${result.faqHit.answer}`);
    }

    if (result.kbChunks.length > 0) {
      const chunks = result.kbChunks.slice(0, 3).map(c => c.content).join('\n\n');
      parts.push(`КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ:\n${chunks}`);
    }

    if (result.intent) {
      parts.push(`НАМЕРЕНИЕ: ${result.intent.name} (уверенность ${Math.round(result.confidence * 100)}%)`);
    }

    return parts.length > 0 ? parts.join('\n\n') : 'Информация по запросу не найдена. Предложите клиенту позвонить на горячую линию.';
  } catch {
    return 'Ошибка поиска в базе знаний. Предложите клиенту позвонить на горячую линию.';
  }
}

async function captureLead(
  args: ToolCallArgs,
  tenant: Tenant,
  sessionId: string | null,
): Promise<string> {
  const rawLeadType = String(args['leadType'] ?? 'product_interest');
  const validTypes: LeadType[] = ['callback', 'consultation', 'product_interest'];
  const leadType: LeadType = validTypes.includes(rawLeadType as LeadType)
    ? (rawLeadType as LeadType)
    : 'product_interest';

  try {
    const lead = await createLead({
      tenantId: tenant.id,
      sessionId: sessionId ?? undefined,
      leadType,
      lang: 'ru',
      fullName: args['fullName'] ? String(args['fullName']) : undefined,
      phone: args['phone'] ? String(args['phone']) : undefined,
      productInterest: args['productInterest'] ? String(args['productInterest']) : undefined,
      message: args['message'] ? String(args['message']) : undefined,
      interestType: 'voice_call',
      routingTier: 'realtime_voice',
      confidence: 0.85,
    });

    const score = lead.leadScore;
    const tier = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';
    return `Заявка сохранена в системе (ID: ${lead.id}, статус: ${tier}, счёт ${score}). Скажи клиенту: «Ваши контакты зафиксированы. Если потребуется дополнительная помощь — позвоните на горячую линию». Не обещай обратного звонка и не говори что создал заявку сам.`;
  } catch {
    return 'Не удалось сохранить заявку. Попросите клиента перезвонить или оставьте контакты вручную.';
  }
}

async function classifyIntent(args: ToolCallArgs, tenant: Tenant): Promise<string> {
  const utterance = String(args['utterance'] ?? '');
  if (!utterance.trim()) return 'Уточните высказывание клиента.';

  try {
    const intents = await detectIntent(tenant.id, utterance);
    if (intents.length === 0) return 'Намерение не определено.';

    const top = intents.slice(0, 2).map(
      i => `${i.name} (${i.display_name_ru}, уверенность ${Math.round(i.confidence * 100)}%)`,
    );
    return `Намерения: ${top.join('; ')}`;
  } catch {
    return 'Не удалось определить намерение.';
  }
}

async function createComplaint(args: ToolCallArgs, tenant: Tenant): Promise<string> {
  const description = String(args['description'] ?? '');
  const category = String(args['category'] ?? 'general');
  if (!description.trim()) return 'Опишите суть жалобы.';

  try {
    const pool = getPool();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO admin_escalations
         (tenant_id, title, description, category, severity, auto_detected)
       VALUES ($1, $2, $3, $4, 'medium', true)
       RETURNING id`,
      [tenant.id, `Жалоба (голосовой звонок): ${category}`, description, category],
    );
    const id = rows[0]?.id ?? 'unknown';
    return `Обращение зафиксировано в системе (ID: ${id}). Скажи клиенту: «Ваше обращение зафиксировано и будет рассмотрено в течение 24 часов». Не используй слова "зарегистрировано" или "оформлено мной". Если вопрос срочный — предложи позвонить на горячую линию.`;
  } catch {
    return 'Не удалось сохранить жалобу. Предложите клиенту написать на email банка или позвонить повторно.';
  }
}

async function getProductRecommendations(args: ToolCallArgs): Promise<string> {
  const query = String(args['query'] ?? '');
  const intentName = args['intentName'] ? String(args['intentName']) : null;

  try {
    const goal = extractGoal(intentName, query, 'ru');
    const result = buildRecommendations(goal);
    if (result.recommendations.length === 0) {
      return 'Конкретные продукты не определены. Уточните у клиента цель и сумму.';
    }
    // Render as plain text (no markdown — this is voice)
    const lines: string[] = [];
    result.recommendations.slice(0, 2).forEach((rec, i) => {
      lines.push(`${i + 1}. ${rec.productName}: ${rec.tagline}. ${rec.bestFor}.`);
    });
    lines.push(result.consultantNote.replace(/\*\*/g, '').replace(/💡 /g, ''));
    return lines.join(' ');
  } catch {
    return 'Не удалось подобрать рекомендации. Уточните у клиента детали запроса.';
  }
}

// ── Dispatch table ────────────────────────────────────────────────────────────

export async function handleRealtimeTool(
  toolName: string,
  args: ToolCallArgs,
  tenant: Tenant,
  sessionId: string | null,
): Promise<string> {
  switch (toolName) {
    case 'search_bank_knowledge':
      return searchBankKnowledge(args, tenant);
    case 'capture_lead':
      return captureLead(args, tenant, sessionId);
    case 'classify_intent':
      return classifyIntent(args, tenant);
    case 'create_complaint':
      return createComplaint(args, tenant);
    case 'get_product_recommendations':
      return getProductRecommendations(args);
    default:
      return `Инструмент "${toolName}" не найден.`;
  }
}
