import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/client.js';
import { invalidateFaqCache } from '../rag/faq-engine.js';
import { invalidateIntentCache } from '../rag/intent-engine.js';
import { getLeads, updateLeadStatus, type LeadStatus } from '../features/leads/service.js';
import { getDashboardStats } from '../analytics/tracker.js';

export async function adminRoute(app: FastifyInstance): Promise<void> {
  // GET /api/admin/kb/search?tenant=xxx&q=yyy&lang=uz
  app.get('/api/admin/kb/search', async (req, reply) => {
    const { tenant, q, lang, limit = '10' } = req.query as Record<string, string>;
    if (!tenant || !q) return reply.code(400).send({ error: 'tenant and q required' });
    const pool = getPool();
    const like = `%${q}%`;
    if (lang) {
      const { rows } = await pool.query(
        `SELECT id, chunk_id, title, LEFT(content, 200) AS content_preview, answer, category, lang, frequency, kb_confidence
           FROM kb_chunks
          WHERE tenant_id = $1 AND (title ILIKE $2 OR content ILIKE $2 OR answer ILIKE $2) AND lang = $4
          LIMIT $3`,
        [tenant, like, parseInt(limit, 10), lang],
      );
      return reply.send({ results: rows, total: rows.length });
    } else {
      const { rows } = await pool.query(
        `SELECT id, chunk_id, title, LEFT(content, 200) AS content_preview, answer, category, lang, frequency, kb_confidence
           FROM kb_chunks
          WHERE tenant_id = $1 AND (title ILIKE $2 OR content ILIKE $2 OR answer ILIKE $2)
          LIMIT $3`,
        [tenant, like, parseInt(limit, 10)],
      );
      return reply.send({ results: rows, total: rows.length });
    }
  });

  // GET /api/admin/faq?tenant=xxx&q=yyy
  app.get('/api/admin/faq', async (req, reply) => {
    const { tenant, q, limit = '20' } = req.query as Record<string, string>;
    if (!tenant) return reply.code(400).send({ error: 'tenant required' });
    const pool = getPool();
    if (q) {
      const { rows } = await pool.query(
        `SELECT faq_id, kb_id, category, question, LEFT(answer, 300) AS answer_preview, frequency, score
           FROM faq_entries
          WHERE tenant_id = $1 AND (question ILIKE $3 OR answer ILIKE $3)
          ORDER BY score DESC
          LIMIT $2`,
        [tenant, parseInt(limit, 10), `%${q}%`],
      );
      return reply.send({ faqs: rows, total: rows.length });
    } else {
      const { rows } = await pool.query(
        `SELECT faq_id, kb_id, category, question, LEFT(answer, 300) AS answer_preview, frequency, score
           FROM faq_entries
          WHERE tenant_id = $1
          ORDER BY score DESC
          LIMIT $2`,
        [tenant, parseInt(limit, 10)],
      );
      return reply.send({ faqs: rows, total: rows.length });
    }
  });

  // GET /api/admin/intents?tenant=xxx
  app.get('/api/admin/intents', async (req, reply) => {
    const { tenant } = req.query as Record<string, string>;
    if (!tenant) return reply.code(400).send({ error: 'tenant required' });
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT intent_id, name, display_name_uz, display_name_ru, category, kb_count,
              array_length(example_questions, 1) AS example_count
         FROM intent_entries
        WHERE tenant_id = $1
        ORDER BY kb_count DESC`,
      [tenant],
    );
    return reply.send({ intents: rows });
  });

  // GET /api/admin/stats?tenant=xxx
  app.get('/api/admin/stats', async (req, reply) => {
    const { tenant } = req.query as Record<string, string>;
    if (!tenant) return reply.code(400).send({ error: 'tenant required' });
    const pool = getPool();
    const [kb, faq, intents, sessions] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) AS embedded,
                lang
           FROM kb_chunks
          WHERE tenant_id = $1
          GROUP BY lang`,
        [tenant],
      ),
      pool.query('SELECT COUNT(*) AS total FROM faq_entries WHERE tenant_id = $1', [tenant]),
      pool.query('SELECT COUNT(*) AS total FROM intent_entries WHERE tenant_id = $1', [tenant]),
      pool.query(
        `SELECT COUNT(*) AS total FROM sessions
          WHERE tenant_id = $1 AND created_at > now() - interval '7 days'`,
        [tenant],
      ),
    ]);
    return reply.send({
      kb: kb.rows,
      faq: faq.rows[0],
      intents: intents.rows[0],
      sessions_7d: sessions.rows[0],
    });
  });

  // POST /api/admin/cache/invalidate?tenant=xxx
  app.post('/api/admin/cache/invalidate', async (req, reply) => {
    const { tenant } = req.query as Record<string, string>;
    if (!tenant) return reply.code(400).send({ error: 'tenant required' });
    invalidateFaqCache(tenant);
    invalidateIntentCache(tenant);
    return reply.send({ ok: true, message: `Caches invalidated for tenant: ${tenant}` });
  });

  // ── Analytics ─────────────────────────────────────────────────────────────

  // GET /api/admin/analytics?tenant=xxx&days=7
  app.get('/api/admin/analytics', async (req, reply) => {
    const { tenant, days = '7' } = req.query as Record<string, string>;
    if (!tenant) return reply.code(400).send({ error: 'tenant required' });
    const stats = await getDashboardStats(tenant, parseInt(days, 10));
    return reply.send(stats);
  });

  // ── Lead Management ───────────────────────────────────────────────────────

  // GET /api/admin/leads?tenant=xxx&status=new&limit=50&offset=0
  app.get('/api/admin/leads', async (req, reply) => {
    const { tenant, status, limit = '50', offset = '0' } = req.query as Record<string, string>;
    if (!tenant) return reply.code(400).send({ error: 'tenant required' });
    const leadsOpts: { status?: LeadStatus; limit?: number; offset?: number } = {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    };
    if (status) leadsOpts.status = status as LeadStatus;
    const leads = await getLeads(tenant, leadsOpts);
    return reply.send({ leads, total: leads.length });
  });

  // PATCH /api/admin/leads/:id/status?tenant=xxx
  app.patch('/api/admin/leads/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { tenant } = req.query as Record<string, string>;
    const { status } = req.body as { status: LeadStatus };
    if (!tenant || !status) return reply.code(400).send({ error: 'tenant and status required' });
    const updated = await updateLeadStatus(id, tenant, status);
    return updated
      ? reply.send({ ok: true })
      : reply.code(404).send({ error: 'lead not found' });
  });
}
