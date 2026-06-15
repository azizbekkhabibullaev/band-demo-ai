/**
 * Voice Banking Assistant — Phase 1 (Russian only)
 *
 * POST /api/voice/transcribe   — audio → text via Whisper (ru)
 * POST /api/voice/synthesize   — text → audio/mpeg via OpenAI TTS
 * POST /api/voice/sessions     — start/turn/end a voice session
 * GET  /api/admin/voice/stats  — admin analytics (requires Authorization header)
 */

import type { FastifyPluginAsync } from 'fastify';
import { transcribeAudio } from '../services/audio/transcribe.js';
import { getPool } from '../db/client.js';

const apiKey = () => process.env.OPENAI_API_KEY ?? '';

// Truncate text to first sentence boundary ≤ max chars (keeps TTS snappy)
function truncateForTTS(text: string, max = 800): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
  return last > max * 0.5 ? cut.slice(0, last + 1) : cut.trimEnd() + '…';
}

export const voiceRoute: FastifyPluginAsync = async (app) => {

  // ── POST /api/voice/transcribe ──────────────────────────────────────────────
  app.post('/api/voice/transcribe', async (req, reply) => {
    const data = await req.file().catch(() => null);
    if (!data) return reply.code(400).send({ error: 'No audio file provided' });

    const { lang = 'ru' } = req.query as Record<string, string>;
    if (lang !== 'ru') {
      return reply.code(400).send({ error: 'Phase 1 supports Russian (ru) only' });
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch {
      return reply.code(400).send({ error: 'Failed to read audio data' });
    }
    if (buffer.length < 500) {
      return reply.send({ text: '', confidence: 0 }); // too short = silence
    }

    try {
      const result = await transcribeAudio(buffer, data.filename ?? 'voice.webm', apiKey(), 'ru');
      return reply.send({ text: result.text, confidence: result.confidence });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[voice/transcribe] ${msg}`);
      return reply.code(502).send({ error: 'Transcription failed' });
    }
  });

  // ── POST /api/voice/synthesize ──────────────────────────────────────────────
  app.post('/api/voice/synthesize', { bodyLimit: 16 * 1024 }, async (req, reply) => {
    const { text, voice = 'nova' } = req.body as { text?: string; voice?: string };
    if (!text?.trim()) return reply.code(400).send({ error: 'text is required' });

    const input = truncateForTTS(text.trim());

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({ model: 'tts-1', input, voice, response_format: 'mp3' }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`[voice/synthesize] TTS error ${res.status}: ${detail}`);
      return reply.code(502).send({ error: 'TTS failed' });
    }

    const audio = Buffer.from(await res.arrayBuffer());
    return reply
      .header('Content-Type', 'audio/mpeg')
      .header('Cache-Control', 'no-store')
      .send(audio);
  });

  // ── POST /api/voice/sessions ────────────────────────────────────────────────
  // Fire-and-forget session lifecycle tracking (analytics only)
  app.post('/api/voice/sessions', async (req, reply) => {
    const body = req.body as {
      action?: 'start' | 'turn' | 'end';
      voice_session_id?: string;
      session_id?: string;
      tenant_id?: string;
      lang?: string;
      duration_ms?: number;
      is_lead?: boolean;
    };

    const pool = getPool();
    const tenantId = body.tenant_id ?? 'ipoteka-bank';

    try {
      if (body.action === 'start') {
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO voice_sessions (tenant_id, session_id, lang)
           VALUES ($1, $2::uuid, $3) RETURNING id`,
          [tenantId, body.session_id ?? null, body.lang ?? 'ru'],
        );
        return reply.send({ voice_session_id: rows[0]?.id });
      }

      const vsId = body.voice_session_id;
      if (!vsId) return reply.code(400).send({ error: 'voice_session_id required' });

      if (body.action === 'turn') {
        await pool.query(
          `UPDATE voice_sessions SET turn_count = turn_count + 1 WHERE id = $1`,
          [vsId],
        );
      } else if (body.action === 'end') {
        await pool.query(
          `UPDATE voice_sessions
           SET ended_at = now(), duration_ms = $2, is_lead = COALESCE($3, false)
           WHERE id = $1`,
          [vsId, body.duration_ms ?? null, body.is_lead ?? false],
        );
      }
      return reply.send({ ok: true });
    } catch (err) {
      console.error('[voice/sessions]', err);
      return reply.code(500).send({ error: 'Session tracking failed' });
    }
  });

  // ── GET /api/admin/voice/stats ──────────────────────────────────────────────
  app.get('/api/admin/voice/stats', async (req, reply) => {
    const auth = (req.headers.authorization ?? '').replace('Bearer ', '').trim();
    if (!auth) return reply.code(401).send({ error: 'Unauthorized' });

    const days = Math.min(Number((req.query as Record<string, string>).days ?? 30), 365);
    const pool = getPool();

    const { rows } = await pool.query<{
      total: string; avg_duration_ms: string; avg_turns: string; leads: string;
    }>(
      `SELECT
        COUNT(*)::text AS total,
        AVG(duration_ms)::text AS avg_duration_ms,
        AVG(turn_count)::text AS avg_turns,
        SUM(CASE WHEN is_lead THEN 1 ELSE 0 END)::text AS leads
       FROM voice_sessions
       WHERE tenant_id = $1
         AND created_at >= now() - ($2 || ' days')::interval`,
      ['ipoteka-bank', days],
    );

    const r = rows[0] ?? { total: '0', avg_duration_ms: '0', avg_turns: '0', leads: '0' };
    return reply.send({
      total:          parseInt(r.total ?? '0', 10),
      avgDurationMs:  Math.round(parseFloat(r.avg_duration_ms ?? '0') || 0),
      avgTurns:       parseFloat(r.avg_turns ?? '0') || 0,
      leads:          parseInt(r.leads ?? '0', 10),
      days,
    });
  });
};
