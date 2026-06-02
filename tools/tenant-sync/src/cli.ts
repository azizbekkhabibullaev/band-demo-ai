import { readFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { Pool } from 'pg';

interface TenantConfigYaml {
  name: string;
  allowedOrigins: string[];
  config: Record<string, unknown>;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const tenantArgIdx = args.indexOf('--tenant');
  const tenantValue = args[tenantArgIdx + 1];
  if (tenantArgIdx === -1 || !tenantValue) {
    // eslint-disable-next-line no-console
    console.error('usage: npm run tenant:sync -- --tenant <id>');
    process.exit(2);
  }
  const tenantId = tenantValue;

  // KB lives at the monorepo root. From this file (tools/tenant-sync/src/cli.ts)
  // that's three directories up: cli.ts -> src -> tenant-sync -> tools -> root
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, '../../..');
  const configPath = join(root, 'kb', tenantId, '_config.yaml');

  const yamlText = await readFile(configPath, 'utf8');
  const parsed = parseYaml(yamlText) as TenantConfigYaml;

  if (!parsed?.name || !Array.isArray(parsed.allowedOrigins) || !parsed.config) {
    throw new Error(`invalid config in ${configPath}: missing name/allowedOrigins/config`);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://chatbot:chatbot@localhost:5433/chatbot',
  });
  try {
    await pool.query(
      `INSERT INTO tenants (id, name, allowed_origins, config)
         VALUES ($1, $2, $3::text[], $4::jsonb)
       ON CONFLICT (id) DO UPDATE
         SET name            = EXCLUDED.name,
             allowed_origins = EXCLUDED.allowed_origins,
             config          = EXCLUDED.config,
             updated_at      = now()`,
      [tenantId, parsed.name, parsed.allowedOrigins, JSON.stringify(parsed.config)]
    );
    // eslint-disable-next-line no-console
    console.log(`✓ synced tenant ${tenantId}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
