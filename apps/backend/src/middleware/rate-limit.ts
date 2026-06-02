import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ipHash } from '../lib/hash.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function resetRateLimits(): void {
  buckets.clear();
}

function clientIp(req: FastifyRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') {
    const first = fwd.split(',')[0];
    if (first) return first.trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

export async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // Only enforce if a tenant has been resolved by originPlugin.
    if (!req.tenant) return;

    const limit = req.tenant.config.limits?.ratePerMinPerIp ?? 60;
    const ip = clientIp(req);
    const key = `${req.tenant.id}:${ipHash(ip)}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + 60_000 });
      return;
    }

    if (bucket.count >= limit) {
      const retrySeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      reply.header('retry-after', String(retrySeconds));
      reply.code(429).send({ error: { code: 'rate_limited', message: 'Too many requests' } });
      return;
    }

    bucket.count++;
  });
}

// ── Session rate limit ─────────────────────────────────────────
// 10-minute sliding window, in-memory. Complements the per-IP limit.

interface SessionBucket {
  count: number;
  resetAt: number;
}

const sessionBuckets = new Map<string, SessionBucket>();

export function resetSessionRateLimits(): void {
  sessionBuckets.clear();
}

export function checkSessionRateLimit(
  sessionId: string,
  limitPer10Min: number,
): boolean {
  const now = Date.now();
  const bucket = sessionBuckets.get(sessionId);

  if (!bucket || bucket.resetAt <= now) {
    sessionBuckets.set(sessionId, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }

  if (bucket.count >= limitPer10Min) return false;
  bucket.count++;
  return true;
}

(rateLimitPlugin as unknown as { [k: symbol]: boolean })[Symbol.for('skip-override')] = true;
