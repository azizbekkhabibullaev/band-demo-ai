/**
 * Admin Authentication — Zero-dependency JWT (HS256) using Node.js crypto
 *
 * Credentials come from environment variables:
 *   ADMIN_USERNAME  (default: "admin")
 *   ADMIN_PASSWORD  (REQUIRED — no default)
 *   ADMIN_JWT_SECRET (REQUIRED — no default)
 *
 * Token lifetime: 8 hours (one work day)
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const JWT_EXPIRY_SECONDS = 8 * 60 * 60; // 8 hours

// ─── JWT helpers (HS256, no external deps) ────────────────────────────────────

function b64url(data: string | Buffer): string {
  return Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac('sha256', secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export function verifyAdminJwt(token: string): { sub: string; tenant: string } | null {
  const secret = process.env['ADMIN_JWT_SECRET'];
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];

  const expectedSig = b64url(createHmac('sha256', secret).update(`${header}.${body}`).digest());

  let match = false;
  try {
    match = timingSafeEqual(Buffer.from(sig, 'ascii'), Buffer.from(expectedSig, 'ascii'));
  } catch {
    return null;
  }
  if (!match) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof payload['exp'] === 'number' && Date.now() / 1000 > payload['exp']) return null;
  if (typeof payload['sub'] !== 'string' || typeof payload['tenant'] !== 'string') return null;

  return { sub: payload['sub'] as string, tenant: payload['tenant'] as string };
}

// ─── Login ────────────────────────────────────────────────────────────────────

export interface LoginResult {
  ok: boolean;
  token?: string;
  error?: string;
}

export function adminLogin(username: string, password: string, tenantId: string): LoginResult {
  const expectedUser = process.env['ADMIN_USERNAME'] ?? 'admin';
  const expectedPass = process.env['ADMIN_PASSWORD'];
  const secret = process.env['ADMIN_JWT_SECRET'];

  if (!expectedPass || !secret) {
    return { ok: false, error: 'Admin authentication not configured. Set ADMIN_PASSWORD and ADMIN_JWT_SECRET.' };
  }

  let usernameMatch = false;
  let passwordMatch = false;
  try {
    usernameMatch = timingSafeEqual(Buffer.from(username), Buffer.from(expectedUser));
    passwordMatch = timingSafeEqual(Buffer.from(password), Buffer.from(expectedPass));
  } catch {
    return { ok: false, error: 'Invalid credentials' };
  }

  if (!usernameMatch || !passwordMatch) {
    return { ok: false, error: 'Invalid credentials' };
  }

  const now = Math.floor(Date.now() / 1000);
  const token = signJwt(
    { sub: username, tenant: tenantId, iat: now, exp: now + JWT_EXPIRY_SECONDS },
    secret,
  );

  return { ok: true, token };
}

// ─── Express / Fastify guard ──────────────────────────────────────────────────

export function extractAdminToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}
