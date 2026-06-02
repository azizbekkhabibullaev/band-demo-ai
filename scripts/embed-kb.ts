/**
 * Generate real OpenAI embeddings for kb_chunks and write them back to the DB.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npm run embed:kb
 *   OPENAI_API_KEY=sk-... npm run embed:kb -- --tenant other-bank
 *   OPENAI_API_KEY=sk-... npm run embed:kb -- --tenant demo-bank --model text-embedding-3-large
 */

import { configDotenv } from 'dotenv';
configDotenv({ path: new URL('../apps/backend/.env', import.meta.url) });

import { Pool } from 'pg';

const args = process.argv.slice(2);
const tenantId = args[args.indexOf('--tenant') + 1] ?? 'demo-bank';
const model = args[args.indexOf('--model') + 1] ?? 'text-embedding-3-small';
const BATCH = 8; // parallel requests per batch

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('OPENAI_API_KEY is not set');
  process.exit(1);
}

async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ input: texts, model }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { data: Array<{ index: number; embedding: number[] }> };
  // Sort by index so order matches input array
  return json.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://chatbot:chatbot@localhost:5433/chatbot',
  });

  try {
    const { rows } = await pool.query<{ id: string; chunk_id: string; lang: string; content: string }>(
      `SELECT id, chunk_id, lang, content FROM kb_chunks WHERE tenant_id = $1 ORDER BY lang, chunk_id`,
      [tenantId],
    );

    if (rows.length === 0) {
      console.log(`No chunks found for tenant "${tenantId}".`);
      return;
    }

    console.log(`Embedding ${rows.length} chunks for "${tenantId}" using ${model}…`);

    let done = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const vectors = await embed(batch.map(r => r.content));

      await Promise.all(
        batch.map((row, j) => {
          const vec = vectors[j]!;
          const literal = `[${vec.join(',')}]`;
          return pool.query(
            `UPDATE kb_chunks SET embedding = $1::vector, updated_at = now() WHERE id = $2`,
            [literal, row.id],
          );
        }),
      );

      done += batch.length;
      console.log(`  ${done}/${rows.length} — ${batch.map(r => `${r.lang}:${r.chunk_id}`).join(', ')}`);
    }

    console.log(`\n✓ All ${rows.length} embeddings updated.`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
