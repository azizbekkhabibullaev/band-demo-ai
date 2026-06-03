/**
 * Admin API Routes — Banking Intelligence Platform
 *
 * All routes under /api/admin/* (except /api/admin/auth/login) require
 * a valid JWT in the Authorization: Bearer <token> header.
 *
 * The JWT is issued by POST /api/admin/auth/login and contains
 * { sub: username, tenant: tenantId }.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../db/client.js';
import { invalidateFaqCache } from '../rag/faq-engine.js';
import { invalidateIntentCache } from '../rag/intent-engine.js';
import { getLeads, updateLeadStatus, type LeadStatus } from '../features/leads/service.js';
import { getDashboardStats } from '../analytics/tracker.js';
import { adminLogin, verifyAdminJwt, extractAdminToken } from '../admin/auth.js';
import {
  getKpiSnapshot,
  getTopicStats,
  getComplaintStats,
  getTrendItems,
  getConversationList,
  getDailyVolume,
  getEscalations,
  updateEscalationStatus,
  createEscalation,
  runEscalationEngine,
  generateAiInsights,
  getLeadFunnel,
} from '../admin/intelligence.js';

// ─── CORS helper for admin routes ────────────────────────────────────────────

function addAdminCors(req: FastifyRequest, reply: FastifyReply): void {
  const origin = req.headers.origin;
  if (typeof origin === 'string') {
    reply.header('access-control-allow-origin', origin);
    reply.header('access-control-allow-headers', 'content-type, authorization');
    reply.header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
}

// ─── Auth guard ───────────────────────────────────────────────────────────────

function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): { sub: string; tenant: string } | null {
  addAdminCors(req, reply);
  const token = extractAdminToken(req.headers.authorization);
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' });
    return null;
  }
  const claims = verifyAdminJwt(token);
  if (!claims) {
    reply.code(401).send({ error: 'Invalid or expired token' });
    return null;
  }
  return claims;
}

export async function adminRoute(app: FastifyInstance): Promise<void> {

  // ── OPTIONS preflight for admin routes ─────────────────────────────────────
  app.options('/api/admin/*', async (req, reply) => {
    addAdminCors(req, reply);
    reply.code(204).send();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════════════════

  // POST /api/admin/auth/login
  app.post('/api/admin/auth/login', async (req, reply) => {
    addAdminCors(req, reply);
    const { username, password, tenant } = req.body as {
      username: string;
      password: string;
      tenant?: string;
    };
    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password required' });
    }
    const tenantId = tenant ?? process.env['DEFAULT_TENANT'] ?? 'ipoteka-bank';
    const result = adminLogin(username, password, tenantId);
    if (!result.ok) {
      return reply.code(401).send({ error: result.error });
    }
    return reply.send({ token: result.token, tenant: tenantId });
  });

  // GET /api/admin/auth/verify
  app.get('/api/admin/auth/verify', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    return reply.send({ ok: true, sub: claims.sub, tenant: claims.tenant });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // INTELLIGENCE — KPIs, Topics, Complaints, Trends, Volume, AI Insights
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/admin/intelligence/kpi?days=7
  app.get('/api/admin/intelligence/kpi', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { days = '7' } = req.query as Record<string, string>;
    const kpi = await getKpiSnapshot(claims.tenant, parseInt(days, 10));
    return reply.send(kpi);
  });

  // GET /api/admin/intelligence/topics?days=7
  app.get('/api/admin/intelligence/topics', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { days = '7' } = req.query as Record<string, string>;
    const topics = await getTopicStats(claims.tenant, parseInt(days, 10));
    return reply.send({ topics });
  });

  // GET /api/admin/intelligence/complaints?days=7
  app.get('/api/admin/intelligence/complaints', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { days = '7' } = req.query as Record<string, string>;
    const complaints = await getComplaintStats(claims.tenant, parseInt(days, 10));
    return reply.send({ complaints });
  });

  // GET /api/admin/intelligence/trends?days=7
  app.get('/api/admin/intelligence/trends', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { days = '7' } = req.query as Record<string, string>;
    const trends = await getTrendItems(claims.tenant, parseInt(days, 10));
    return reply.send({ trends });
  });

  // GET /api/admin/intelligence/volume?days=30
  app.get('/api/admin/intelligence/volume', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { days = '30' } = req.query as Record<string, string>;
    const volume = await getDailyVolume(claims.tenant, parseInt(days, 10));
    return reply.send({ volume });
  });

  // GET /api/admin/intelligence/insights?days=7
  app.get('/api/admin/intelligence/insights', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { days = '7' } = req.query as Record<string, string>;
    const insights = await generateAiInsights(claims.tenant, parseInt(days, 10));
    return reply.send({ insights });
  });

  // ── Dashboard combined endpoint (single request for dashboard page) ────────
  // GET /api/admin/intelligence/dashboard?days=7
  app.get('/api/admin/intelligence/dashboard', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { days = '7' } = req.query as Record<string, string>;
    const d = parseInt(days, 10);

    const [kpi, topics, trends, volume, escalations, leadFunnel] = await Promise.all([
      getKpiSnapshot(claims.tenant, d),
      getTopicStats(claims.tenant, d),
      getTrendItems(claims.tenant, d),
      getDailyVolume(claims.tenant, d),
      getEscalations(claims.tenant, 'open'),
      getLeadFunnel(claims.tenant),
    ]);

    return reply.send({ kpi, topics, trends, volume, escalations, leadFunnel, days: d });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CONVERSATIONS
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/admin/conversations?limit=20&offset=0&lang=&search=
  app.get('/api/admin/conversations', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { limit = '20', offset = '0', lang, search } = req.query as Record<string, string>;
    const result = await getConversationList(claims.tenant, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      ...(lang ? { lang } : {}),
      ...(search ? { search } : {}),
    });
    return reply.send(result);
  });

  // GET /api/admin/conversations/:sessionId/messages
  app.get('/api/admin/conversations/:sessionId/messages', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { sessionId } = req.params as { sessionId: string };
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id, role, content, lang, created_at, escalation_signaled,
              prompt_tokens, completion_tokens, latency_ms
       FROM messages WHERE session_id=$1
       ORDER BY created_at`,
      [sessionId],
    );
    return reply.send({ messages: rows });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ESCALATIONS
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/admin/escalations?status=open
  app.get('/api/admin/escalations', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { status } = req.query as Record<string, string>;
    const escalations = await getEscalations(claims.tenant, status);
    return reply.send({ escalations });
  });

  // POST /api/admin/escalations
  app.post('/api/admin/escalations', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const body = req.body as {
      title: string;
      description: string;
      category: string;
      severity: string;
    };
    if (!body.title || !body.description) {
      return reply.code(400).send({ error: 'title and description required' });
    }
    const id = await createEscalation(claims.tenant, body);
    return reply.code(201).send({ id });
  });

  // PATCH /api/admin/escalations/:id
  app.patch('/api/admin/escalations/:id', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const { status, notes } = req.body as { status: string; notes?: string };
    if (!status) return reply.code(400).send({ error: 'status required' });
    const ok = await updateEscalationStatus(id, claims.tenant, status, notes);
    return ok ? reply.send({ ok: true }) : reply.code(404).send({ error: 'not found' });
  });

  // POST /api/admin/escalations/run-engine (trigger auto-detection)
  app.post('/api/admin/escalations/run-engine', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const created = await runEscalationEngine(claims.tenant);
    return reply.send({ created });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // LEGACY / EXISTING ENDPOINTS (unchanged, now JWT-protected)
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/admin/kb/search?q=yyy&lang=uz
  app.get('/api/admin/kb/search', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { q, lang, limit = '10' } = req.query as Record<string, string>;
    if (!q) return reply.code(400).send({ error: 'q required' });
    const pool = getPool();
    const like = `%${q}%`;
    const rows = lang
      ? (await pool.query(
          `SELECT id, chunk_id, title, LEFT(content, 200) AS content_preview, answer, category, lang
           FROM kb_chunks WHERE tenant_id=$1 AND (title ILIKE $2 OR content ILIKE $2) AND lang=$4 LIMIT $3`,
          [claims.tenant, like, parseInt(limit, 10), lang],
        )).rows
      : (await pool.query(
          `SELECT id, chunk_id, title, LEFT(content, 200) AS content_preview, answer, category, lang
           FROM kb_chunks WHERE tenant_id=$1 AND (title ILIKE $2 OR content ILIKE $2) LIMIT $3`,
          [claims.tenant, like, parseInt(limit, 10)],
        )).rows;
    return reply.send({ results: rows, total: rows.length });
  });

  // GET /api/admin/faq?q=yyy
  app.get('/api/admin/faq', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { q, limit = '20' } = req.query as Record<string, string>;
    const pool = getPool();
    const rows = q
      ? (await pool.query(
          `SELECT faq_id, kb_id, category, question, LEFT(answer, 300) AS answer_preview, frequency, score
           FROM faq_entries WHERE tenant_id=$1 AND (question ILIKE $3 OR answer ILIKE $3) ORDER BY score DESC LIMIT $2`,
          [claims.tenant, parseInt(limit, 10), `%${q}%`],
        )).rows
      : (await pool.query(
          `SELECT faq_id, kb_id, category, question, LEFT(answer, 300) AS answer_preview, frequency, score
           FROM faq_entries WHERE tenant_id=$1 ORDER BY score DESC LIMIT $2`,
          [claims.tenant, parseInt(limit, 10)],
        )).rows;
    return reply.send({ faqs: rows, total: rows.length });
  });

  // GET /api/admin/intents
  app.get('/api/admin/intents', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT intent_id, name, display_name_uz, display_name_ru, category, kb_count,
              array_length(example_questions, 1) AS example_count
       FROM intent_entries WHERE tenant_id=$1 ORDER BY kb_count DESC`,
      [claims.tenant],
    );
    return reply.send({ intents: rows });
  });

  // GET /api/admin/stats
  app.get('/api/admin/stats', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const pool = getPool();
    const [kb, faq, intents, sessions] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total, COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) AS embedded, lang
         FROM kb_chunks WHERE tenant_id=$1 GROUP BY lang`,
        [claims.tenant],
      ),
      pool.query('SELECT COUNT(*) AS total FROM faq_entries WHERE tenant_id=$1', [claims.tenant]),
      pool.query('SELECT COUNT(*) AS total FROM intent_entries WHERE tenant_id=$1', [claims.tenant]),
      pool.query(
        `SELECT COUNT(*) AS total FROM sessions WHERE tenant_id=$1 AND created_at > now() - interval '7 days'`,
        [claims.tenant],
      ),
    ]);
    return reply.send({ kb: kb.rows, faq: faq.rows[0], intents: intents.rows[0], sessions_7d: sessions.rows[0] });
  });

  // GET /api/admin/analytics?days=7
  app.get('/api/admin/analytics', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { days = '7' } = req.query as Record<string, string>;
    const stats = await getDashboardStats(claims.tenant, parseInt(days, 10));
    return reply.send(stats);
  });

  // GET /api/admin/leads?status=new&limit=50&offset=0
  app.get('/api/admin/leads', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { status, limit = '50', offset = '0' } = req.query as Record<string, string>;
    const leads = await getLeads(claims.tenant, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      ...(status ? { status: status as LeadStatus } : {}),
    });
    return reply.send({ leads, total: leads.length });
  });

  // PATCH /api/admin/leads/:id/status
  app.patch('/api/admin/leads/:id/status', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: LeadStatus };
    if (!status) return reply.code(400).send({ error: 'status required' });
    const ok = await updateLeadStatus(id, claims.tenant, status);
    return ok ? reply.send({ ok: true }) : reply.code(404).send({ error: 'lead not found' });
  });

  // POST /api/admin/cache/invalidate
  app.post('/api/admin/cache/invalidate', async (req, reply) => {
    const claims = requireAdmin(req, reply);
    if (!claims) return;
    invalidateFaqCache(claims.tenant);
    invalidateIntentCache(claims.tenant);
    return reply.send({ ok: true, message: `Caches invalidated for tenant: ${claims.tenant}` });
  });
}
