import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ulid } from 'ulid';
import { log, type Logger } from '../observability/log.js';

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    appLog: Logger;
  }
}

export async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const incoming = req.headers['x-request-id'];
    const value = typeof incoming === 'string' && ULID_RE.test(incoming) ? incoming : ulid();
    req.requestId = value;
    req.appLog = log.child({ request_id: value });
    reply.header('x-request-id', value);
  });
}

// Fastify encapsulates plugins by default: hooks added inside a registered plugin
// only apply to routes registered as children of THAT plugin. Since healthRoute
// is a sibling registration, we opt out of encapsulation. Same mechanism
// `fastify-plugin` uses internally; inlined to avoid the extra dependency.
(requestIdPlugin as unknown as { [k: symbol]: boolean })[Symbol.for('skip-override')] = true;
