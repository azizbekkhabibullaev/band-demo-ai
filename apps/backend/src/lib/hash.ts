import { createHash } from 'node:crypto';

const SALT = process.env.IP_HASH_SALT ?? 'dev-salt-change-me';

export function ipHash(ip: string): string {
  return createHash('sha256').update(ip + SALT).digest('hex').slice(0, 16);
}
