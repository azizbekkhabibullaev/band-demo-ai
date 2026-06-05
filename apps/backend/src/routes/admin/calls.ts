/**
 * VOC (Voice of Customer) — Call Analytics API
 *
 * POST   /api/admin/calls/upload       — upload audio files
 *          ?language=uz|ru              — REQUIRED. Selected language is source of truth.
 * GET    /api/admin/calls              — list with filters
 * GET    /api/admin/calls/analytics    — KPI stats
 * GET    /api/admin/calls/trends       — period-over-period trends
 * GET    /api/admin/calls/topics       — top categories / subcategories
 * GET    /api/admin/calls/:id          — single call detail
 * DELETE /api/admin/calls/:id          — delete record
 *
 * SUPPORTED LANGUAGES: uz (Uzbek) and ru (Russian) only.
 * The language selected in the UI is the source of truth.
 * Whisper's detected language is NEVER used or stored.
 *
 * PIPELINE per uploaded file:
 *   1. Whisper STT  (language='uz' → kk proxy; language='ru' → ru)
 *   2. Uzbek normalizer (GPT rewrite — only when language='uz')
 *   3. GPT classification (language-aware prompt, summary always in Russian)
 *   4. Auto-lead creation (if leadScore ≥ 60)
 *   5. DB persist
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../../db/client.js';
import { verifyAdminJwt, extractAdminToken } from '../../admin/auth.js';
import { transcribeAudio, type SupportedLanguage } from '../../services/audio/transcribe.js';
import { analyzeTranscript, normalizeUzbek } from '../../services/audio/analyze.js';
import { createLead } from '../../features/leads/service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '../../../../..', 'uploads', 'calls');

// ─── CORS + Auth ──────────────────────────────────────────────────────────────

function cors(req: FastifyRequest, reply: FastifyReply): void {
  const o = req.headers.origin;
  if (typeof o === 'string') {
    reply.header('access-control-allow-origin', o);
    reply.header('access-control-allow-headers', 'content-type, authorization');
    reply.header('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  }
}

function auth(req: FastifyRequest, reply: FastifyReply): { sub: string; tenant: string } | null {
  cors(req, reply);
  const token = extractAdminToken(req.headers.authorization);
  if (!token) { reply.code(401).send({ error: 'Unauthorized' }); return null; }
  const claims = verifyAdminJwt(token);
  if (!claims) { reply.code(401).send({ error: 'Invalid or expired token' }); return null; }
  return claims;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALLOWED_EXTS = new Set(['mp3', 'wav', 'm4a', 'webm', 'mp4', 'mpeg', 'mpga', 'ogg', 'flac']);

function validateExt(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTS.has(ext);
}

/**
 * Full processing pipeline for a single call.
 *
 * language = 'uz' | 'ru'  — REQUIRED, from user selection, never auto-detected.
 *
 *   'uz' → Whisper STT (kk proxy) → GPT Uzbek normalizer → GPT classifier (uz prompt)
 *   'ru' → Whisper STT (ru)       → GPT classifier (ru prompt)
 */
async function processCall(
  callId: string,
  tenantId: string,
  buffer: Buffer,
  filename: string,
  language: SupportedLanguage,
): Promise<void> {
  const pool = getPool();
  const apiKey = process.env['OPENAI_API_KEY'] ?? '';

  try {
    // Mark as processing
    await pool.query(
      `UPDATE calls SET status = 'processing', updated_at = now() WHERE id = $1`,
      [callId],
    );

    // ── Step 1: Whisper STT ──────────────────────────────────────────────────
    // language is passed directly — transcribeAudio handles the kk proxy for uz.
    // Whisper's detected language is ignored; the selected language is the truth.
    const transcription = await transcribeAudio(buffer, filename, apiKey, language);

    console.info(
      `[processCall] id=${callId} language="${language}" ` +
      `confidence=${transcription.confidence.toFixed(2)} ` +
      `duration=${transcription.durationSeconds}s`,
    );

    // ── Step 2: Uzbek normalizer (uz only) ───────────────────────────────────
    // Whisper's kk-proxy output is Cyrillic Kazakh-phonetic.
    // GPT rewrites it into literary Uzbek (Latin script, proper apostrophes).
    let finalTranscript = transcription.text;
    if (language === 'uz' && finalTranscript.length > 10) {
      finalTranscript = await normalizeUzbek(finalTranscript, apiKey);
    }

    // ── Step 3: GPT classification ───────────────────────────────────────────
    // Pass the selected language so the classifier uses the correct prompt
    // and produces the correct category/topic vocabulary.
    // Summary is always written in Russian (management reads Russian).
    const analysis = await analyzeTranscript(finalTranscript, apiKey, 'gpt-4o-mini', language);

    // ── Step 4: Auto-create lead ─────────────────────────────────────────────
    let leadId: string | null = null;
    if (analysis.isLead && analysis.leadScore >= 60) {
      try {
        const lead = await createLead({
          tenantId,
          leadType:        'product_interest',
          lang:            language,
          productInterest: analysis.leadInterest || analysis.category,
          interestType:    analysis.category,
          message:         `[Из звонка] ${analysis.summary.slice(0, 300)}`,
          confidence:      analysis.leadScore / 100,
        });
        leadId = lead.id;
      } catch { /* non-critical */ }
    }

    // ── Step 5: Persist ──────────────────────────────────────────────────────
    await pool.query(
      `UPDATE calls SET
         duration_seconds = $1, language = $2,
         transcript = $3, summary = $4,
         sentiment = $5, sentiment_score = $6,
         category = $7, subcategory = $8,
         priority = $9, topics = $10::jsonb,
         is_lead = $11, lead_score = $12, lead_interest = $13, lead_id = $14,
         is_complaint = $15, complaint_notes = $16,
         confidence = $17,
         status = 'completed', updated_at = now()
       WHERE id = $18`,
      [
        transcription.durationSeconds,
        language,                          // selected language — always stored as-is
        finalTranscript,
        analysis.summary,
        analysis.sentiment,
        analysis.sentimentScore,
        analysis.category,
        analysis.subcategory,
        analysis.priority,
        JSON.stringify(analysis.topics),
        analysis.isLead,
        analysis.leadScore,
        analysis.leadInterest,
        leadId,
        analysis.isComplaint,
        analysis.complaintNotes,
        transcription.confidence,
        callId,
      ],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE calls SET status = 'failed', error_message = $1, updated_at = now() WHERE id = $2`,
      [msg.slice(0, 500), callId],
    );
  }
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function callsRoute(app: FastifyInstance): Promise<void> {

  // OPTIONS preflight
  app.options('/api/admin/calls*', async (req, reply) => {
    cors(req, reply);
    reply.code(204).send();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // POST /api/admin/calls/upload?language=uz|ru
  //
  // language is REQUIRED. Returns 400 if missing or invalid.
  //   ?language=uz   → Uzbek pipeline (kk proxy + normalizer)
  //   ?language=ru   → Russian pipeline
  // ──────────────────────────────────────────────────────────────────────────
  app.post('/api/admin/calls/upload', async (req, reply) => {
    const claims = auth(req, reply);
    if (!claims) return;

    const { language: langParam } = req.query as Record<string, string>;

    // Strict validation — only uz and ru accepted
    if (langParam !== 'uz' && langParam !== 'ru') {
      return reply.code(400).send({
        error: 'language parameter is required and must be "uz" or "ru"',
      });
    }
    const language = langParam as SupportedLanguage;

    await mkdir(UPLOADS_DIR, { recursive: true });

    const created: { callId: string; filename: string; status: string; language: string }[] = [];
    const pool = getPool();

    try {
      const parts = (req as FastifyRequest & { parts(): AsyncIterable<unknown> }).parts();

      for await (const part of parts) {
        const p = part as {
          type: string;
          filename?: string;
          fieldname?: string;
          toBuffer?: () => Promise<Buffer>;
          file?: AsyncIterable<{ data: Buffer }>;
        };

        if (p.type !== 'file' || !p.filename) continue;
        if (!validateExt(p.filename)) continue;

        // Collect file buffer
        let buffer: Buffer;
        if (typeof p.toBuffer === 'function') {
          buffer = await p.toBuffer();
        } else if (p.file) {
          const chunks: Buffer[] = [];
          for await (const chunk of p.file) chunks.push(chunk.data);
          buffer = Buffer.concat(chunks);
        } else {
          continue;
        }

        // Persist file to disk
        const safeFilename = `${Date.now()}_${p.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const filePath = join(UPLOADS_DIR, safeFilename);
        await writeFile(filePath, buffer);

        // Insert DB record — pre-set language so UI shows correct lang immediately
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO calls (tenant_id, filename, file_path, language, status)
           VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
          [claims.tenant, p.filename, filePath, language],
        );
        const callId = rows[0]!.id;
        created.push({
          callId,
          filename: p.filename,
          status:   'pending',
          language,
        });

        // Fire-and-forget — non-blocking, processes in background
        processCall(callId, claims.tenant, buffer, p.filename, language)
          .catch(() => undefined);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: msg });
    }

    if (created.length === 0) {
      return reply.code(400).send({ error: 'No valid audio files found in request' });
    }

    return reply.send({ uploaded: created, count: created.length });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/admin/calls/analytics
  // ──────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/calls/analytics', async (req, reply) => {
    const claims = auth(req, reply);
    if (!claims) return;

    const { days = '30' } = req.query as Record<string, string>;
    const d = parseInt(days, 10);
    const pool = getPool();

    const [stats, sentiment, categories] = await Promise.all([
      pool.query<Record<string, unknown>>(
        `SELECT
           COUNT(*)                                                 AS total,
           COUNT(*) FILTER (WHERE status = 'completed')            AS classified,
           COUNT(*) FILTER (WHERE is_lead = TRUE)                  AS commercial,
           COUNT(*) FILTER (WHERE is_complaint = TRUE)             AS complaints,
           ROUND(AVG(duration_seconds) FILTER (WHERE duration_seconds > 0))::int AS avg_duration,
           COUNT(*) FILTER (WHERE sentiment = 'positive')          AS positive,
           COUNT(*) FILTER (WHERE sentiment = 'neutral')           AS neutral,
           COUNT(*) FILTER (WHERE sentiment = 'negative')          AS negative
         FROM calls
         WHERE tenant_id = $1
           AND created_at >= now() - ($2 || ' days')::interval`,
        [claims.tenant, d],
      ),
      pool.query<{ sentiment: string; cnt: string }>(
        `SELECT sentiment, COUNT(*) AS cnt
         FROM calls
         WHERE tenant_id = $1 AND status = 'completed'
           AND created_at >= now() - ($2 || ' days')::interval
         GROUP BY sentiment`,
        [claims.tenant, d],
      ),
      pool.query<{ category: string; cnt: string }>(
        `SELECT category, COUNT(*) AS cnt
         FROM calls
         WHERE tenant_id = $1 AND status = 'completed'
           AND category IS NOT NULL
           AND created_at >= now() - ($2 || ' days')::interval
         GROUP BY category ORDER BY cnt DESC LIMIT 10`,
        [claims.tenant, d],
      ),
    ]);

    const row = stats.rows[0] ?? {};
    return reply.send({
      total:      Number(row['total']       ?? 0),
      classified: Number(row['classified']  ?? 0),
      commercial: Number(row['commercial']  ?? 0),
      complaints: Number(row['complaints']  ?? 0),
      avgDuration: Number(row['avg_duration'] ?? 0),
      positive:   Number(row['positive']    ?? 0),
      neutral:    Number(row['neutral']     ?? 0),
      negative:   Number(row['negative']    ?? 0),
      sentimentBreakdown: sentiment.rows.map(r => ({
        sentiment: r.sentiment,
        count: Number(r.cnt),
      })),
      topCategories: categories.rows.map(r => ({
        category: r.category,
        count: Number(r.cnt),
      })),
      days: d,
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/admin/calls/trends
  // ──────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/calls/trends', async (req, reply) => {
    const claims = auth(req, reply);
    if (!claims) return;

    const { days = '14' } = req.query as Record<string, string>;
    const d = parseInt(days, 10);
    const pool = getPool();

    const { rows } = await pool.query<{
      category: string; current: string; previous: string;
    }>(
      `WITH current AS (
         SELECT category, COUNT(*) AS cnt FROM calls
         WHERE tenant_id = $1 AND status = 'completed' AND category IS NOT NULL
           AND created_at >= now() - ($2 || ' days')::interval
         GROUP BY category
       ), previous AS (
         SELECT category, COUNT(*) AS cnt FROM calls
         WHERE tenant_id = $1 AND status = 'completed' AND category IS NOT NULL
           AND created_at >= now() - ($3 || ' days')::interval
           AND created_at <  now() - ($2 || ' days')::interval
         GROUP BY category
       )
       SELECT COALESCE(c.category, p.category) AS category,
              COALESCE(c.cnt, 0) AS current, COALESCE(p.cnt, 0) AS previous
       FROM current c FULL OUTER JOIN previous p USING (category)
       ORDER BY COALESCE(c.cnt, 0) DESC`,
      [claims.tenant, d, d * 2],
    );

    const trends = rows.map(r => {
      const cur = Number(r.current);
      const prev = Number(r.previous);
      const changePct = prev === 0
        ? (cur > 0 ? 100 : 0)
        : Math.round(((cur - prev) / prev) * 100);
      return {
        category:  r.category,
        current:   cur,
        previous:  prev,
        changePct,
        direction: cur > prev ? 'up' : cur < prev ? 'down' : 'stable',
        isAnomaly: Math.abs(changePct) > 40,
      };
    });

    return reply.send({ trends, days: d });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/admin/calls/topics
  // ──────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/calls/topics', async (req, reply) => {
    const claims = auth(req, reply);
    if (!claims) return;

    const { days = '30' } = req.query as Record<string, string>;
    const d = parseInt(days, 10);
    const pool = getPool();

    const [cats, subs] = await Promise.all([
      pool.query<{ category: string; cnt: string }>(
        `SELECT category, COUNT(*) AS cnt FROM calls
         WHERE tenant_id = $1 AND status = 'completed' AND category IS NOT NULL
           AND created_at >= now() - ($2 || ' days')::interval
         GROUP BY category ORDER BY cnt DESC LIMIT 10`,
        [claims.tenant, d],
      ),
      pool.query<{ subcategory: string; cnt: string }>(
        `SELECT subcategory, COUNT(*) AS cnt FROM calls
         WHERE tenant_id = $1 AND status = 'completed'
           AND subcategory IS NOT NULL AND subcategory != ''
           AND created_at >= now() - ($2 || ' days')::interval
         GROUP BY subcategory ORDER BY cnt DESC LIMIT 10`,
        [claims.tenant, d],
      ),
    ]);

    return reply.send({
      topCategories:    cats.rows.map(r => ({ category: r.category, count: Number(r.cnt) })),
      topSubcategories: subs.rows.map(r => ({ subcategory: r.subcategory, count: Number(r.cnt) })),
      days: d,
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/admin/calls  — paginated list with filters
  // ──────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/calls', async (req, reply) => {
    const claims = auth(req, reply);
    if (!claims) return;

    const {
      limit     = '30',
      offset    = '0',
      sentiment,
      category,
      priority,
      language,
      isLead,
      isComplaint,
      status,
      search,
      days,
    } = req.query as Record<string, string>;

    const pool = getPool();
    const where: string[] = ['c.tenant_id = $1'];
    const params: unknown[] = [claims.tenant];
    let idx = 2;

    function add(cond: string, val: unknown): void {
      if (val === undefined) return;
      where.push(cond.replace('$?', `$${idx++}`));
      params.push(val);
    }

    if (sentiment)            add('c.sentiment = $?',   sentiment);
    if (category)             add('c.category = $?',    category);
    if (priority)             add('c.priority = $?',    priority);
    if (language)             add('c.language = $?',    language);
    if (status)               add('c.status = $?',      status);
    if (isLead === 'true')    add('c.is_lead = $?',     true);
    if (isComplaint === 'true') add('c.is_complaint = $?', true);
    if (days)                 add(`c.created_at >= now() - ($? || ' days')::interval`, days);

    if (search) {
      where.push(`(c.transcript ILIKE $${idx} OR c.summary ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = where.join(' AND ');

    const [rows, countRow] = await Promise.all([
      pool.query<Record<string, unknown>>(
        `SELECT c.id, c.filename, c.duration_seconds, c.language, c.sentiment,
                c.category, c.subcategory, c.priority, c.is_lead, c.lead_score,
                c.lead_interest, c.lead_id, c.is_complaint, c.status,
                c.summary, c.created_at, c.updated_at
         FROM calls c
         WHERE ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, parseInt(limit, 10), parseInt(offset, 10)],
      ),
      pool.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM calls c WHERE ${whereClause}`,
        params,
      ),
    ]);

    return reply.send({
      calls: rows.rows,
      total: Number(countRow.rows[0]?.cnt ?? 0),
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GET /api/admin/calls/:id
  // ──────────────────────────────────────────────────────────────────────────
  app.get('/api/admin/calls/:id', async (req, reply) => {
    const claims = auth(req, reply);
    if (!claims) return;

    const { id } = req.params as { id: string };
    const pool = getPool();

    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT c.*,
              l.full_name AS lead_name, l.phone AS lead_phone,
              l.status AS lead_status, l.lead_score AS lead_lead_score
       FROM calls c
       LEFT JOIN leads l ON l.id = c.lead_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [id, claims.tenant],
    );

    if (!rows[0]) return reply.code(404).send({ error: 'Call not found' });
    return reply.send({ call: rows[0] });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DELETE /api/admin/calls/:id
  // ──────────────────────────────────────────────────────────────────────────
  app.delete('/api/admin/calls/:id', async (req, reply) => {
    const claims = auth(req, reply);
    if (!claims) return;

    const { id } = req.params as { id: string };
    const pool = getPool();

    await pool.query(
      `DELETE FROM calls WHERE id = $1 AND tenant_id = $2`,
      [id, claims.tenant],
    );

    return reply.send({ ok: true });
  });
}
