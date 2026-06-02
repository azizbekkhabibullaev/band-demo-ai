import 'dotenv/config';
import Fastify, { type FastifyInstance } from 'fastify';
import { pathToFileURL } from 'node:url';
import { healthRoute } from './routes/health.js';
import { widgetConfigRoute } from './routes/widget-config.js';
import { sessionRoute } from './routes/session.js';
import { chatRoute } from './routes/chat.js';
import { requestIdPlugin } from './middleware/request-id.js';
import { originPlugin } from './middleware/origin.js';
import { rateLimitPlugin } from './middleware/rate-limit.js';
import { adminRoute } from './routes/admin.js';
import { leadsRoute } from './routes/leads.js';

export async function build(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    bodyLimit: 8 * 1024,
  });

  await app.register(requestIdPlugin);
  await app.register(originPlugin);
  await app.register(rateLimitPlugin);
  await app.register(healthRoute);
  await app.register(widgetConfigRoute);
  await app.register(sessionRoute);
  await app.register(chatRoute);
  await app.register(leadsRoute);
  await app.register(adminRoute);

  return app;
}

const entry = process.argv[1];
const isMain = entry !== undefined && import.meta.url === pathToFileURL(entry).href;
if (isMain) {
  const PORT = Number(process.env.PORT ?? 3000);
  const app = await build();
  await app.listen({ port: PORT, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${PORT}`);
}
