import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SessionNewRequest, SessionNewResponse } from '@bank-chatbot/shared';
import { getPool } from '../db/client.js';
import { ipHash } from '../lib/hash.js';

function clientIp(req: FastifyRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') {
    const first = fwd.split(',')[0];
    if (first) return first.trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

export async function sessionRoute(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SessionNewRequest; Reply: SessionNewResponse | { error: { code: string; message: string } } }>(
    '/api/session/new',
    async (req, reply) => {
      if (!req.tenant) {
        return reply.code(404).send({ error: { code: 'not_found', message: 'Not found' } });
      }
      const userMeta = req.body.user_meta ?? {};
      const ipH = ipHash(clientIp(req));

      const pool = getPool();
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO sessions (tenant_id, lang, user_meta, ip_hash)
           VALUES ($1, $2, $3::jsonb, $4)
        RETURNING id`,
        [req.tenant.id, req.tenant.config.languages.default, JSON.stringify(userMeta), ipH]
      );

      return { session_id: rows[0]!.id };
    }
  );
}
