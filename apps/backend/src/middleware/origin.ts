import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { resolveTenant } from '../tenants/resolver.js';
import type { Tenant } from '../tenants/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: Tenant;
  }
}

function extractTenantId(req: FastifyRequest): string | undefined {
  // Route param (e.g. /api/widget-config/:tenant)
  const params = req.params as Record<string, string | undefined> | undefined;
  if (params?.tenant && typeof params.tenant === 'string') return params.tenant;

  // JSON body (e.g. POST /api/session/new with { tenant_id })
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body.tenant_id === 'string') return body.tenant_id;

  // Query string fallback
  const query = req.query as Record<string, string | undefined> | undefined;
  if (query?.tenant_id) return query.tenant_id;

  return undefined;
}

export async function originPlugin(app: FastifyInstance): Promise<void> {
  // OPTIONS preflight at onRequest — no body to inspect, allow unconditionally.
  // The follow-up real request will be tenant-validated at preValidation.
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method !== 'OPTIONS') return;
    const origin = req.headers.origin;
    if (typeof origin === 'string') {
      reply.header('access-control-allow-origin', origin);
      reply.header('access-control-allow-methods', 'GET, POST, OPTIONS');
      reply.header('access-control-allow-headers', 'content-type, x-request-id, authorization');
      reply.header('access-control-max-age', '600');
    }
    reply.code(204).send();
  });

  // Tenant resolution + origin allow-list at preValidation — after body parsing,
  // so we can read req.body.tenant_id for POST routes that carry it there.
  app.addHook('preValidation', async (req: FastifyRequest, reply: FastifyReply) => {
    const tenantId = extractTenantId(req);
    if (!tenantId) return; // Route doesn't require tenant context (e.g. /api/health)

    const tenant = await resolveTenant(tenantId);
    if (!tenant) {
      reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
      return;
    }

    const origin = req.headers.origin;
    if (typeof origin === 'string' && !tenant.allowedOrigins.includes(origin)) {
      reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
      return;
    }

    if (typeof origin === 'string') {
      reply.header('access-control-allow-origin', origin);
    }
    req.tenant = tenant;
  });
}

(originPlugin as unknown as { [k: symbol]: boolean })[Symbol.for('skip-override')] = true;
