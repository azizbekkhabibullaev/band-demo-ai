/**
 * Lead Capture Route — Enterprise Banking AI Platform
 *
 * Public endpoint: customers submit callback / consultation requests
 * directly from the chat widget.
 */

import type { FastifyInstance } from 'fastify';
import { createLead } from '../features/leads/service.js';
import { trackEvent } from '../analytics/tracker.js';
import { updateContext } from '../memory/context.js';
import { getPool } from '../db/client.js';

export async function leadsRoute(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/leads
   *
   * Body:
   *   tenant_id       string  required
   *   session_id      string  optional
   *   lead_type       'callback' | 'consultation' | 'escalation' | 'product_interest'
   *   phone           string  optional
   *   preferred_time  string  optional
   *   product_interest string optional
   *   message         string  optional
   *   lang            string  optional (defaults to 'ru')
   */
  app.post('/api/leads', async (req, reply) => {
    if (!req.tenant) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
    }

    const tenant = req.tenant;
    const body = req.body as {
      session_id?: string;
      lead_type?: string;
      full_name?: string;
      phone?: string;
      preferred_time?: string;
      product_interest?: string;
      interest_type?: string;
      message?: string;
      lang?: string;
    };

    const validTypes = ['callback', 'consultation', 'escalation', 'product_interest'];
    const leadType = validTypes.includes(body.lead_type ?? '')
      ? (body.lead_type as 'callback' | 'consultation' | 'escalation' | 'product_interest')
      : 'consultation';

    const lead = await createLead({
      tenantId: tenant.id,
      sessionId: body.session_id,
      leadType,
      lang: body.lang ?? (tenant.config.languages.default as string) ?? 'ru',
      fullName: body.full_name,
      phone: body.phone,
      preferredTime: body.preferred_time,
      productInterest: body.product_interest,
      interestType: body.interest_type,
      message: body.message,
    });

    // Track analytics
    trackEvent({
      tenantId: tenant.id,
      sessionId: body.session_id,
      eventType: 'lead_captured',
      properties: { lead_type: leadType, product_interest: body.product_interest },
    });

    // Update customer context
    if (body.session_id) {
      updateContext(body.session_id, tenant.id, { leadCaptured: true }).catch(() => {});
    }

    return reply.code(201).send({
      ok: true,
      lead_id: lead.id,
      message: 'Lead captured successfully',
    });
  });

  /**
   * POST /api/analytics/quick-action
   *
   * Lightweight click tracking — called by the widget when a quick action chip is clicked.
   * Best-effort; never blocks the user flow.
   *
   * Body: { tenant_id, session_id?, message_id?, intent?, lang?, chip_label, chip_type? }
   */
  app.post('/api/analytics/quick-action', async (req, reply) => {
    if (!req.tenant) return reply.code(404).send({ ok: false });
    const body = req.body as {
      session_id?: string;
      message_id?: string;
      intent?: string;
      lang?: string;
      chip_label?: string;
      chip_type?: string;
    };
    if (!body.chip_label) return reply.code(400).send({ ok: false });

    try {
      await getPool().query(
        `INSERT INTO quick_action_clicks
           (tenant_id, session_id, message_id, intent, lang, chip_label, chip_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          req.tenant.id,
          body.session_id ?? null,
          body.message_id ?? null,
          body.intent ?? null,
          body.lang ?? null,
          body.chip_label,
          body.chip_type ?? null,
        ],
      );
    } catch {
      // non-critical — ignore DB errors silently
    }

    return reply.code(201).send({ ok: true });
  });
}
