/**
 * Ingest Ipoteka Bank knowledge assets into the database.
 *
 * Loads:
 *   - canonical_kb_v2.jsonl   → kb_chunks (1,410 entries, with real OpenAI embeddings)
 *   - faq_dataset.json         → faq_entries (400 entries, with embeddings)
 *   - intents.json             → intent_entries (22 entries)
 *
 * Usage:
 *   npm run ingest:ipoteka
 *   npm run ingest:ipoteka -- --tenant ipoteka-bank --skip-embeddings
 */

import { configDotenv } from 'dotenv';
configDotenv({ path: new URL('../apps/backend/.env', import.meta.url) });

import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const KB_BASE = '/Users/azizbekkhabibullaev/Library/Application Support/Claude/local-agent-mode-sessions/dcc149aa-49b2-4e8e-ba71-68c701cb6f0f/68476c69-4694-44c8-a650-405828abe624/local_3c79316f-8a1b-411b-a118-91a99698c63b/outputs/base-banking';

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const TENANT_ID = args.includes('--tenant') ? args[args.indexOf('--tenant') + 1] : 'ipoteka-bank';
const SKIP_EMBEDDINGS = args.includes('--skip-embeddings');
const BATCH_SIZE = 50; // OpenAI embeddings batch size

// ── Database pool ─────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://chatbot:chatbot@localhost:5432/chatbot',
});

// ── OpenAI embeddings ─────────────────────────────────────────────────────────
async function embedBatch(texts: string[], model: string): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || SKIP_EMBEDDINGS) {
    // Return placeholder zero vectors
    return texts.map(() => new Array(1536).fill(0));
  }

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ input: texts, model }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${body}`);
  }

  const json = await res.json() as { data: Array<{ index: number; embedding: number[] }> };
  // Sort by index to preserve order
  const sorted = json.data.sort((a, b) => a.index - b.index);
  return sorted.map(d => d.embedding);
}

async function embedWithRetry(texts: string[], model: string, maxRetries = 3): Promise<number[][]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await embedBatch(texts, model);
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const wait = attempt * 2000;
      console.warn(`  ⚠ Embedding attempt ${attempt} failed, retrying in ${wait}ms...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error('unreachable');
}

// ── JSONL reader ──────────────────────────────────────────────────────────────
async function readJsonl<T>(filePath: string): Promise<T[]> {
  const results: T[] = [];
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) results.push(JSON.parse(trimmed) as T);
  }
  return results;
}

// ── Language mapping ──────────────────────────────────────────────────────────
function mapLang(raw: string): 'uz' | 'ru' {
  if (raw === 'russian') return 'ru';
  return 'uz'; // uzbek + mixed → uz
}

// ── Phase 0: Tenant setup ─────────────────────────────────────────────────────
async function setupTenant(): Promise<void> {
  console.log(`\n▶ Setting up tenant: ${TENANT_ID}`);
  const configPath = join(ROOT, 'kb', TENANT_ID, '_config.yaml');
  const yaml = await readFile(configPath, 'utf8');
  const parsed = parseYaml(yaml) as {
    name: string;
    allowedOrigins: string[];
    config: Record<string, unknown>;
  };

  await pool.query(
    `INSERT INTO tenants (id, name, allowed_origins, config)
       VALUES ($1, $2, $3::text[], $4::jsonb)
     ON CONFLICT (id) DO UPDATE
       SET name            = EXCLUDED.name,
           allowed_origins = EXCLUDED.allowed_origins,
           config          = EXCLUDED.config,
           updated_at      = now()`,
    [TENANT_ID, parsed.name, parsed.allowedOrigins, JSON.stringify(parsed.config)],
  );
  console.log(`  ✓ Tenant "${parsed.name}" upserted`);
}

// ── Phase 1: Load canonical KB → kb_chunks ────────────────────────────────────
interface CanonicalKbEntry {
  id: string;
  category: string;
  canonical_question: string;
  canonical_answer: string;
  frequency: number;
  confidence: number;
  alternative_questions: string[];
  language: string;
}

interface RagEntry {
  id: string;
  search_text: string;
  keywords: string[];
  language: string;
  question: string;
  answer: string;
}

async function ingestKbChunks(): Promise<void> {
  console.log('\n▶ Loading canonical KB + RAG dataset…');
  const [kbEntries, ragEntries] = await Promise.all([
    readJsonl<CanonicalKbEntry>(join(KB_BASE, 'canonical_kb_v2.jsonl')),
    readJsonl<RagEntry>(join(KB_BASE, 'rag_dataset_v2.jsonl')),
  ]);

  // Build search_text lookup from RAG dataset
  const ragMap = new Map<string, RagEntry>(ragEntries.map(r => [r.id, r]));

  const EMBEDDING_MODEL = 'text-embedding-3-small';
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < kbEntries.length; i += BATCH_SIZE) {
    const batch = kbEntries.slice(i, i + BATCH_SIZE);

    // Build texts to embed (use search_text from RAG dataset for richer retrieval)
    const texts = batch.map(entry => {
      const rag = ragMap.get(entry.id);
      // search_text already includes alt questions + synonyms
      return rag?.search_text ?? `${entry.canonical_question}\n${entry.canonical_answer}`;
    });

    let embeddings: number[][];
    try {
      embeddings = await embedWithRetry(texts, EMBEDDING_MODEL);
    } catch (err) {
      console.error(`  ✗ Embedding batch ${i}-${i + BATCH_SIZE} failed:`, err);
      errors += batch.length;
      continue;
    }

    // Upsert each entry
    for (let j = 0; j < batch.length; j++) {
      const entry = batch[j]!;
      const rag = ragMap.get(entry.id);
      const content = rag?.search_text ?? `${entry.canonical_question}\n${entry.canonical_answer}`;
      const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
      const embedding = embeddings[j]!;
      const vectorLiteral = `[${embedding.join(',')}]`;
      const tokens = Math.ceil(content.length / 4);

      // Use language from RAG dataset (more reliable than canonical KB field)
      const ragLang = mapLang(rag?.language ?? 'uzbek');

      try {
        await pool.query(
          `INSERT INTO kb_chunks
             (tenant_id, lang, source_file, chunk_id, category, title, content, answer,
              embedding, tokens, content_hash, frequency, kb_confidence, alt_questions)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector,$10,$11,$12,$13,$14)
           ON CONFLICT (tenant_id, lang, chunk_id) DO UPDATE
             SET title        = EXCLUDED.title,
                 content      = EXCLUDED.content,
                 answer       = EXCLUDED.answer,
                 embedding    = EXCLUDED.embedding,
                 tokens       = EXCLUDED.tokens,
                 content_hash = EXCLUDED.content_hash,
                 frequency    = EXCLUDED.frequency,
                 kb_confidence = EXCLUDED.kb_confidence,
                 alt_questions = EXCLUDED.alt_questions,
                 updated_at   = now()`,
          [
            TENANT_ID,
            ragLang,
            `${entry.category.toLowerCase()}.md`,
            entry.id,
            entry.category,
            entry.canonical_question,
            content,
            entry.canonical_answer,
            vectorLiteral,
            tokens,
            contentHash,
            entry.frequency ?? 1,
            entry.confidence ?? 0.5,
            entry.alternative_questions ?? [],
          ],
        );
        inserted++;
      } catch (err) {
        console.error(`  ✗ KB insert failed for ${entry.id}:`, err);
        errors++;
      }
    }

    process.stdout.write(`  KB: ${Math.min(i + BATCH_SIZE, kbEntries.length)}/${kbEntries.length} ✓\r`);

    // Rate-limit pause between batches (OpenAI tier limits)
    if (i + BATCH_SIZE < kbEntries.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n  ✓ KB chunks: ${inserted} upserted, ${skipped} skipped, ${errors} errors`);
}

// ── Phase 2: Load FAQs → faq_entries ─────────────────────────────────────────
interface FaqEntry {
  faq_id: string;
  kb_id: string;
  category: string;
  question: string;
  answer: string;
  frequency: number;
  keywords: string[];
  has_steps: boolean;
  alt_count: number;
  score: number;
}

async function ingestFaqs(): Promise<void> {
  console.log('\n▶ Loading FAQ dataset…');
  const raw = await readFile(join(KB_BASE, 'faq_dataset.json'), 'utf8');
  const { faqs } = JSON.parse(raw) as { faqs: FaqEntry[] };
  console.log(`  Found ${faqs.length} FAQs`);

  const EMBEDDING_MODEL = 'text-embedding-3-small';
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < faqs.length; i += BATCH_SIZE) {
    const batch = faqs.slice(i, i + BATCH_SIZE);
    const texts = batch.map(f => f.question);

    let embeddings: number[][];
    try {
      embeddings = await embedWithRetry(texts, EMBEDDING_MODEL);
    } catch (err) {
      console.error(`  ✗ FAQ embedding batch failed:`, err);
      errors += batch.length;
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const faq = batch[j]!;
      const embedding = embeddings[j]!;
      const vectorLiteral = `[${embedding.join(',')}]`;

      try {
        await pool.query(
          `INSERT INTO faq_entries
             (tenant_id, faq_id, kb_id, category, question, answer, keywords, frequency, score, embedding)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector)
           ON CONFLICT (tenant_id, faq_id) DO UPDATE
             SET kb_id     = EXCLUDED.kb_id,
                 category  = EXCLUDED.category,
                 question  = EXCLUDED.question,
                 answer    = EXCLUDED.answer,
                 keywords  = EXCLUDED.keywords,
                 frequency = EXCLUDED.frequency,
                 score     = EXCLUDED.score,
                 embedding = EXCLUDED.embedding`,
          [
            TENANT_ID,
            faq.faq_id,
            faq.kb_id ?? null,
            faq.category,
            faq.question,
            faq.answer,
            faq.keywords,
            faq.frequency,
            faq.score,
            vectorLiteral,
          ],
        );
        inserted++;
      } catch (err) {
        console.error(`  ✗ FAQ insert failed for ${faq.faq_id}:`, err);
        errors++;
      }
    }

    process.stdout.write(`  FAQ: ${Math.min(i + BATCH_SIZE, faqs.length)}/${faqs.length} ✓\r`);

    if (i + BATCH_SIZE < faqs.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n  ✓ FAQs: ${inserted} upserted, ${errors} errors`);
}

// ── Phase 3: Load intents → intent_entries ────────────────────────────────────
interface IntentEntry {
  intent_id: string;
  name: string;
  display_name_uz: string;
  display_name_ru: string;
  category: string;
  example_questions: string[];
  kb_count: number;
}

async function ingestIntents(): Promise<void> {
  console.log('\n▶ Loading intents…');
  const raw = await readFile(join(KB_BASE, 'intents.json'), 'utf8');
  const { intents } = JSON.parse(raw) as { intents: IntentEntry[] };
  console.log(`  Found ${intents.length} intents`);

  let inserted = 0;
  let errors = 0;

  for (const intent of intents) {
    // Extract keywords from example questions (3+ char tokens)
    const allText = intent.example_questions.join(' ').toLowerCase();
    const keywords = [...new Set(
      allText
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3)
    )].slice(0, 50); // cap at 50 keywords per intent

    try {
      await pool.query(
        `INSERT INTO intent_entries
           (tenant_id, intent_id, name, display_name_uz, display_name_ru,
            category, example_questions, keywords, kb_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (tenant_id, intent_id) DO UPDATE
           SET name             = EXCLUDED.name,
               display_name_uz  = EXCLUDED.display_name_uz,
               display_name_ru  = EXCLUDED.display_name_ru,
               category         = EXCLUDED.category,
               example_questions = EXCLUDED.example_questions,
               keywords         = EXCLUDED.keywords,
               kb_count         = EXCLUDED.kb_count`,
        [
          TENANT_ID,
          intent.intent_id,
          intent.name,
          intent.display_name_uz,
          intent.display_name_ru,
          intent.category,
          intent.example_questions,
          keywords,
          intent.kb_count,
        ],
      );
      inserted++;
    } catch (err) {
      console.error(`  ✗ Intent insert failed for ${intent.intent_id}:`, err);
      errors++;
    }
  }

  console.log(`  ✓ Intents: ${inserted} upserted, ${errors} errors`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
async function printSummary(): Promise<void> {
  const [kb, faq, intents] = await Promise.all([
    pool.query(
      `SELECT lang, COUNT(*) AS total,
              COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) AS with_embeddings
         FROM kb_chunks WHERE tenant_id = $1 GROUP BY lang ORDER BY lang`,
      [TENANT_ID],
    ),
    pool.query('SELECT COUNT(*) AS total FROM faq_entries WHERE tenant_id = $1', [TENANT_ID]),
    pool.query('SELECT COUNT(*) AS total FROM intent_entries WHERE tenant_id = $1', [TENANT_ID]),
  ]);

  console.log('\n════════════════════════════════════════');
  console.log(`  INGESTION COMPLETE for: ${TENANT_ID}`);
  console.log('════════════════════════════════════════');
  console.log('  KB chunks by language:');
  for (const row of kb.rows) {
    console.log(`    ${row.lang}: ${row.total} total, ${row.with_embeddings} with embeddings`);
  }
  console.log(`  FAQ entries:    ${faq.rows[0]?.total}`);
  console.log(`  Intent entries: ${intents.rows[0]?.total}`);
  console.log('\n  Start the server: npm run dev');
  console.log('  Widget:          npm run dev:widget\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const start = Date.now();
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Ipoteka Bank Knowledge Base Ingestion   ║');
  console.log('╚══════════════════════════════════════════╝');
  if (SKIP_EMBEDDINGS) console.log('  ⚠  --skip-embeddings: using zero vectors');

  try {
    await setupTenant();
    await ingestKbChunks();
    await ingestFaqs();
    await ingestIntents();
    await printSummary();
    console.log(`  Total time: ${((Date.now() - start) / 1000).toFixed(1)}s`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('\n✗ Ingestion failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
