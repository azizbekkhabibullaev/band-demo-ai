import type { FastifyInstance } from 'fastify';
import type { WidgetConfigResponse } from '@bank-chatbot/shared';

export async function widgetConfigRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { tenant: string } }>('/api/widget-config/:tenant', async (req, reply) => {
    // originPlugin's preValidation has already resolved req.tenant and enforced origin.
    if (!req.tenant) {
      return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
    }
    const t = req.tenant;
    const response: WidgetConfigResponse = {
      tenant_id: t.id,
      name: t.name,
      branding: t.config.branding,
      languages: t.config.languages,
      hotline: t.config.hotline,
      greeting: t.config.greeting,
    };
    return response;
  });
}
