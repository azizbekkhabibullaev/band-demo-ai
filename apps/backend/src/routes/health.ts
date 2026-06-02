import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@bank-chatbot/shared';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };
const VERSION = pkg.version;

const startedAt = Date.now();

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      version: VERSION,
    };
  });
}
