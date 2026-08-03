/**
 * Voice Realtime WS Proxy — Phase 3
 *
 * @fastify/websocket v8 (Fastify v4) hands the handler a SocketStream (Duplex),
 * not a raw WebSocket. The actual ws.WebSocket lives at connection.socket.
 * All send/on/readyState operations go through `socket` below.
 *
 * ws v8 delivers ALL WebSocket frames as Buffer — use the `isBinary` flag
 * (second parameter of the 'message' event) to distinguish text (JSON) from
 * binary (PCM16 audio). Buffer.isBuffer() is always true; do NOT use it here.
 *
 * OpenAI Realtime GA API (gpt-realtime-1.5) vs beta differences:
 *   - No OpenAI-Beta header required
 *   - session.update requires session.type = 'realtime'
 *   - Audio config nested under audio.input / audio.output
 *   - Events renamed: response.audio.* → response.output_audio.*
 *                     response.audio_transcript.* → response.output_audio_transcript.*
 *
 * Protocol:
 *   Browser  ──────────────────────────────────►  Backend  ──────────►  OpenAI Realtime
 *   (binary) PCM16 audio chunks                              input_audio_buffer.append
 *   (JSON)   {"type":"user_text","text":"..."}               conversation.item.create (test mode)
 *   (JSON)   {"type":"end"}                                  close + generate WOW summary
 *   (JSON)   {"type":"interrupt"}                            response.cancel
 *
 *   Backend  ◄──────────────────────────────────  OpenAI Realtime
 *   (binary) PCM16 audio                          response.output_audio.delta
 *   (JSON)   transcript events, state changes, tool traces, session summary
 */

import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import WebSocket from 'ws';
import { resolveTenant } from '../tenants/resolver.js';
import { buildRealtimeSessionConfig } from '../services/voice/realtime-session.js';
import { handleRealtimeTool } from '../services/voice/realtime-tools.js';
import { validateTurn } from '../services/voice/turn-validator.js';
import { validateInterruption } from '../services/voice/interruption-validator.js';
import { checkDomainRelevance } from '../rag/domain-guard.js';
import { getPool } from '../db/client.js';
import { streamChatCompletion } from '../llm/openai.js';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-realtime-1.5';

// ── Voice-level domain guard ──────────────────────────────────────────────────
// Wraps the shared checkDomainRelevance with voice-specific patterns that the
// general text guard does not cover (simple arithmetic, poems, jokes by voice).
// Trailing [?.!]* handles Whisper punctuation: "Сколько будет 2+2?" has a trailing ?
// that would otherwise escape the end anchor and pass through to the LLM.
const VOICE_OFF_TOPIC_EXTRA = /^\s*(?:[\d\s+\-*/^().]+\s*[=?]?\s*$|сколько\s+будет\s+[\d+\-*/\s()]+|напиши\s+(?:стих|рассказ|эссе|поэму|сонет|письмо)\b(?!.*(?:банк|кредит|жалоб))|расскажи\s+(?:анекдот|шутку|историю\s+про\s+(?!.*(?:банк|кредит)))|(?:кто\s+(?:такой|такая|это|был|была)|who\s+is)\s+(?!.*(?:банк|bank|директор|director)).+)[?.!]*\s*$/i;

function checkVoiceDomain(transcript: string): { allowed: boolean; blockedBy?: string } {
  if (VOICE_OFF_TOPIC_EXTRA.test(transcript)) {
    return { allowed: false, blockedBy: 'voice_off_topic' };
  }
  return checkDomainRelevance(transcript);
}

// Instruction override sent with response.create when a query is off-topic.
// Uses response.instructions to replace system prompt for this single turn only.
const OFF_TOPIC_RESPONSE_CREATE = JSON.stringify({
  type: 'response.create',
  response: {
    instructions: 'Задача этого ответа — только произнести следующую фразу дословно, без добавлений: "Я могу помочь только по вопросам банковских услуг. Что вас интересует?" Не добавляйте ничего.',
    max_output_tokens: 40,
  },
});

// ── Authority boundary validator ──────────────────────────────────────────────
// Monitors the streaming partial transcript for forbidden operational phrases
// that signal the AI is promising to perform actions or request sensitive data.
// On detection the response is immediately cancelled and regenerated with a
// corrective instruction that keeps the AI in the informational-only role.
const FORBIDDEN_OPERATIONAL_PHRASES = [
  // ── First-person action promises ───────────────────────────────────────────
  'я могу оформить',
  'я оформлю',
  'оформляю',               // present tense: "оформляю обращение"
  'я создам',
  'я передам',
  'я зарегистрирую',
  'я заблокирую',
  'я разблокирую',
  'я проверю',
  'я посмотрю',
  'я перезвоню',
  'проверяю',               // present tense: "проверяю баланс / счёт"
  'я могу сделать это для вас',
  'назовите номер карты',
  'назовите ваш телефон',
  'скажите номер карты',
  'соединяю вас со специалистом',
  // ── Implicit action claims — card ──────────────────────────────────────────
  'карта заблокирована',
  'карта будет заблокирована',
  'блокировка выполнена',
  'операция выполнена',
  // ── Implicit action claims — requests ─────────────────────────────────────
  'заявка создана',
  'заявка оформлена',
  'обращение зарегистрировано',
  'ваша заявка принята',
  // ── Callback promises ──────────────────────────────────────────────────────
  'специалист свяжется',
  'вам перезвонят',
  'вам перезвонит',
  'перезвоним вам',
  'ожидайте звонка',
  'мы вам позвоним',
  // ── Account data claims ────────────────────────────────────────────────────
  'баланс составляет',
  'на вашем счете',
  'на вашем счёте',
  'проверил ваши данные',
];

function checkAuthorityViolation(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of FORBIDDEN_OPERATIONAL_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }
  return null;
}

// Regeneration payload sent after an authority violation cancel.
const AUTHORITY_CORRECTION_CREATE = JSON.stringify({
  type: 'response.create',
  response: {
    instructions: 'Ты информационный консультант банка. Твой предыдущий ответ содержал недопустимую фразу — обещание выполнить операцию или запрос личных данных. Ответь заново кратко и правильно: объясни клиенту КАК ОН МОЖЕТ решить вопрос самостоятельно через мобильное приложение, сайт или контакт-центр. Никаких обещаний действий от своего имени.',
    max_output_tokens: 100,
  },
});

// ── Session summary (WOW) generator ──────────────────────────────────────────

async function generateWowSummary(
  transcript: string,
  durationMs: number,
): Promise<Record<string, unknown>> {
  if (transcript.length < 80) {
    return {
      duration_seconds: Math.round(durationMs / 1000),
      topic: 'Краткий звонок',
      interest_level: 'Низкий',
      lead_status: 'none',
      sentiment: 'neutral',
      products_discussed: [],
      next_action: 'Без действий',
      key_signals: [],
    };
  }

  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const prompt = `Проанализируй транскрипт звонка банкового оператора и верни JSON.

ТРАНСКРИПТ:
${transcript.slice(0, 3000)}

Верни ТОЛЬКО валидный JSON без markdown:
{
  "topic": "краткая тема звонка",
  "interest_level": "Высокий|Средний|Низкий",
  "lead_status": "hot|warm|cold|none",
  "sentiment": "positive|neutral|negative",
  "products_discussed": ["список продуктов"],
  "next_action": "рекомендуемое следующее действие",
  "key_signals": ["ключевые сигналы клиента"]
}`;

  try {
    let json = '';
    await streamChatCompletion(
      {
        apiKey,
        model: 'gpt-4o-mini',
        systemPrompt: 'Ты аналитик контакт-центра. Отвечай только валидным JSON.',
        messages: [{ role: 'user', content: prompt }],
      },
      { onDelta: (t) => { json += t; } },
    );
    const parsed = JSON.parse(json.trim()) as Record<string, unknown>;
    return { duration_seconds: Math.round(durationMs / 1000), ...parsed };
  } catch {
    return {
      duration_seconds: Math.round(durationMs / 1000),
      topic: 'Анализ недоступен',
      interest_level: 'Неизвестно',
      lead_status: 'none',
      sentiment: 'neutral',
      products_discussed: [],
      next_action: 'Проверить вручную',
      key_signals: [],
    };
  }
}

// ── Save session to DB ────────────────────────────────────────────────────────

async function saveRealtimeSession(opts: {
  tenantId: string;
  sessionId: string | null;
  durationMs: number;
  turnCount: number;
  transcript: string;
  wowSummary: Record<string, unknown>;
}): Promise<void> {
  const pool = getPool();
  const leadStatus = String(opts.wowSummary['lead_status'] ?? 'none') as
    'hot' | 'warm' | 'cold' | 'none';
  const sentiment = String(opts.wowSummary['sentiment'] ?? 'neutral') as
    'positive' | 'neutral' | 'negative';
  const products = Array.isArray(opts.wowSummary['products_discussed'])
    ? (opts.wowSummary['products_discussed'] as string[])
    : [];

  await pool.query(
    `INSERT INTO realtime_voice_sessions
       (tenant_id, session_id, duration_ms, turn_count, lang, transcript,
        topic_summary, products_discussed, lead_status, sentiment, wow_summary, ended_at)
     VALUES ($1, $2::uuid, $3, $4, 'ru', $5, $6, $7, $8, $9, $10, now())`,
    [
      opts.tenantId,
      opts.sessionId,
      opts.durationMs,
      opts.turnCount,
      opts.transcript,
      String(opts.wowSummary['topic'] ?? ''),
      products,
      leadStatus,
      sentiment,
      JSON.stringify(opts.wowSummary),
    ],
  );
}

// ── WebSocket proxy route ─────────────────────────────────────────────────────

export async function voiceRealtimeRoute(app: FastifyInstance): Promise<void> {
  app.get('/ws/voice/realtime', { websocket: true }, (connection: SocketStream, req) => {
    // @fastify/websocket v8: connection is a SocketStream (Duplex).
    // The actual ws.WebSocket lives at connection.socket.
    const socket = connection.socket;

    const query = req.query as Record<string, string | undefined>;
    const tenantId = query['tenantId'];
    const sessionId = query['sessionId'] ?? null;
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    const connId = Math.random().toString(36).slice(2, 8);
    console.log(`[VoiceRT][${connId}] browser WS connected tenantId=${tenantId} sessionId=${sessionId}`);

    if (!tenantId || !apiKey) {
      console.warn(`[VoiceRT][${connId}] rejected — missing tenantId or API key`);
      socket.send(JSON.stringify({ type: 'error', message: 'Missing tenantId or API key' }));
      socket.close();
      return;
    }

    // Per-call mutable state
    const transcriptLines: string[] = [];
    let turnCount = 0;
    let pendingCallId: string | null = null;
    let pendingToolName: string | null = null;
    let pendingToolArgs = '';
    const callStartMs = Date.now();

    // Response lifecycle tracking — prevents duplicate response.create calls
    let responseInProgress = false;
    // Per-response flag — we notify 'speaking' on the first audio delta only
    let speakingNotified = false;
    // Audio drain tracking: bytes + first-chunk timestamp
    // OpenAI streams 6-7x faster than real-time, so most audio is buffered in PCM16Player
    // at the moment audio.done arrives. Drain delay = (playback duration - stream duration).
    let responseTotalAudioBytes = 0;
    let responseFirstAudioTs: number | null = null;
    // ── Correlation ID tracking ───────────────────────────────────────────────
    // currentResponseId: OpenAI's response.id from response.created.
    // audioDeltaCount: counts audio deltas per response.
    // Every log line includes the responseId so we can answer:
    // "which layer ended response R?" by grepping backend + browser logs.
    let currentResponseId = 'none';
    let audioDeltaCount   = 0;
    // Timestamp of the first audio chunk for this response — used by the barge-in
    // protection window to reject echo-triggered speech_started events
    let aiSpeakingStartMs: number | null = null;
    // Delayed state:listening timer — cancelled on confirmed barge-in
    let listeningTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Smart barge-in state ──────────────────────────────────────────────────
    // With interrupt_response:false + create_response:false we fully control the
    // lifecycle. A speech_started event must be verified before we cancel the AI.
    //
    //   Echo protection (rolling): aiSpeakingStartMs is updated on EVERY audio
    //     delta (not just the first). This keeps the 800ms protection window fresh
    //     for the entire streaming phase. After streaming ends, aiPlaybackEndsMs
    //     blocks barge-in until the browser's audio buffer has drained.
    //
    //   aiPlaybackEndsMs: set in response.output_audio.done to the estimated
    //     moment when the last PCM sample finishes playing in the browser.
    //     Both speech_started paths (barge-in and normal turn) check this.
    //
    //   Timer = BARGE_IN_CONFIRM_MS + SILENCE_DURATION_MS (1400ms): fires only
    //     after the user has spoken for ≥600ms of ACTUAL audio. If timer fires
    //     while aiPlaybackEndsMs is still in the future, cancel is suppressed.
    //
    //   interruptionPending: short sound (<600ms actual) during AI speech — we
    //     wait for the Whisper transcript and run InterruptionValidator to decide
    //     if it contains a real signal word ("нет", "стоп", "подождите", …).
    //
    //   transcriptValidatedResponse: InterruptionValidator approved an interrupt;
    //     response.cancel was sent — response.cancelled handler will send
    //     response.create so the user's utterance is processed.
    const BARGE_IN_PROTECTION_MS  = 1000; // ignore speech within N ms of last audio chunk (1000ms covers slower speaker echo paths)
    const BARGE_IN_CONFIRM_MS     = 600;  // min actual speech duration for confirmed barge-in
    const SILENCE_DURATION_MS     = 800;  // must match silence_duration_ms in realtime-session.ts
    let bargeInTimer: ReturnType<typeof setTimeout> | null = null;
    let bargeInActive = false;           // true after timer fires: response.cancel already sent
    let interruptionPending = false;     // short sound during AI speech, awaiting transcript
    let transcriptValidatedResponse = false; // InterruptionValidator approved; awaiting response.cancelled
    let userSpeechPending = false;       // kept for safety; currently unused after refactor
    // Estimated time when the browser finishes playing the buffered AI audio.
    // Set in response.output_audio.done; cleared when drain completes or on cancel.
    // Blocks barge-in from acoustic echo during the drain phase.
    let aiPlaybackEndsMs: number | null = null;

    // ── Turn validation state ─────────────────────────────────────────────────
    // response.create is NOT sent on speech_stopped. Instead we wait for the
    // Whisper transcript (conversation.item.input_audio_transcription.completed)
    // and run it through TurnValidator before deciding whether to call the LLM.
    // This eliminates AI responses to coughs, fillers, noise, and empty audio.
    let speechStartedAt: number | null = null;  // when user started speaking
    let speechStoppedAt: number | null = null;  // when user stopped speaking
    let awaitingTranscript = false;             // waiting for transcript to validate

    // Tool-chain continuity: when a function call fires while responseInProgress=true
    // we can't send response.create immediately (would duplicate). Set this flag so
    // response.done picks it up and triggers the follow-up response.
    let pendingToolResult = false;

    // ── Authority boundary tracking ───────────────────────────────────────────
    // partialTranscript accumulates delta events for the current response.
    // transcriptViolationDetected is set when a forbidden phrase is found mid-stream;
    // response.cancelled handler reads it to trigger AUTHORITY_CORRECTION_CREATE.
    let partialTranscript = '';
    let transcriptViolationDetected = false;

    // Async init (resolve tenant, open OpenAI WS)
    void (async () => {
      const tenant = await resolveTenant(tenantId);
      if (!tenant) {
        socket.send(JSON.stringify({ type: 'error', message: 'Tenant not found' }));
        socket.close();
        return;
      }

      // ── Open OpenAI Realtime WebSocket ──────────────────────────────────────
      console.log(`[VoiceRT][${connId}] opening OpenAI Realtime WS`);
      const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      // ── OpenAI → Browser ──────────────────────────────────────────────────
      openaiWs.on('open', () => {
        const sessionPayload = buildRealtimeSessionConfig(tenant);
        console.log(`[VoiceRT][${connId}] OUTBOUND session.update:\n${JSON.stringify(sessionPayload, null, 2)}`);
        openaiWs.send(JSON.stringify(sessionPayload));
      });

      openaiWs.on('message', async (raw: WebSocket.RawData) => {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch { return; }

        const eventType = String(event['type'] ?? '');

        switch (eventType) {
          case 'session.updated': {
            console.log(`[VoiceRT][${connId}] INBOUND session.updated:\n${JSON.stringify(event['session'], null, 2)}`);
            socket.send(JSON.stringify({ type: 'connected' }));
            // Trigger proactive greeting — AI speaks immediately on connect
            responseInProgress = true;
            speakingNotified = false;
            openaiWs.send(JSON.stringify({ type: 'response.create' }));
            console.log(`[VoiceRT][${connId}] triggered proactive greeting`);
            break;
          }

          // response.created fires when OpenAI begins generating a response
          case 'response.created': {
            const resp = event['response'] as Record<string, unknown> | undefined;
            currentResponseId = String(resp?.['id'] ?? `r-${Date.now()}`);
            audioDeltaCount   = 0;
            responseInProgress = true;
            speakingNotified = false;
            responseTotalAudioBytes = 0;
            responseFirstAudioTs = null;
            aiSpeakingStartMs = null;
            aiPlaybackEndsMs = null;
            pendingToolResult = false;
            userSpeechPending = false;
            awaitingTranscript = false;
            bargeInActive = false;
            interruptionPending = false;
            transcriptValidatedResponse = false;
            speechStartedAt = null;
            speechStoppedAt = null;
            partialTranscript = '';
            transcriptViolationDetected = false;
            console.log(`[CORR][${connId}][${currentResponseId}] response.created — response starts`);
            break;
          }

          // response.done fires when the entire response (audio + transcript) is complete
          case 'response.done': {
            responseInProgress = false;
            speakingNotified = false;
            // aiSpeakingStartMs intentionally kept — drain timer may still be running
            const doneResp = event['response'] as Record<string, unknown> | undefined;
            const doneStatus = String(doneResp?.['status'] ?? 'completed');
            const doneDetails = doneResp?.['status_details'] as Record<string, unknown> | undefined;
            const truncReason = String(doneDetails?.['reason'] ?? '');
            const playbackEstMs = Math.round(responseTotalAudioBytes / 48000 * 1000);
            console.log(`[CORR][${connId}][${currentResponseId}] response.done — status=${doneStatus} audio_deltas=${audioDeltaCount} bytes=${responseTotalAudioBytes} (~${playbackEstMs}ms)`);
            if (doneStatus === 'incomplete' && truncReason === 'max_output_tokens') {
              console.error(`[CORR][${connId}][${currentResponseId}] *** WARNING: RESPONSE TRUNCATED BY TOKEN LIMIT *** increase max_output_tokens beyond current value`);
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'tool_trace', tool: '__truncation_warning__', args: { reason: truncReason }, result: 'TRUNCATED', call_id: '' }));
              }
            }
            if (pendingToolResult) {
              pendingToolResult = false;
              responseInProgress = true;
              console.log(`[CORR][${connId}][${currentResponseId}] response.done — pending tool result → response.create`);
              if (openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify({ type: 'response.create' }));
              }
            }
            break;
          }

          // response.cancelled fires after we send response.cancel (confirmed barge-in).
          case 'response.cancelled':
            responseInProgress = false;
            speakingNotified = false;
            aiSpeakingStartMs = null;
            aiPlaybackEndsMs = null;
            if (listeningTimer) { clearTimeout(listeningTimer); listeningTimer = null; }
            userSpeechPending = false;
            console.log(`[CORR][${connId}][${currentResponseId}] *** CANCEL CONFIRMED *** response.cancelled received. bargeInActive=${bargeInActive} transcriptValidatedResponse=${transcriptValidatedResponse} interruptionPending=${interruptionPending} awaitingTranscript=${awaitingTranscript}`);
            if (transcriptViolationDetected) {
              transcriptViolationDetected = false;
              responseInProgress = true;
              socket.send(JSON.stringify({ type: 'state', state: 'thinking' }));
              console.log(`[AUTHORITY][${connId}][${currentResponseId}] cancel confirmed — regenerating corrected authority-safe response`);
              if (openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(AUTHORITY_CORRECTION_CREATE);
              }
            } else if (transcriptValidatedResponse) {
              transcriptValidatedResponse = false;
              responseInProgress = true;
              socket.send(JSON.stringify({ type: 'state', state: 'thinking' }));
              console.log(`[CORR][${connId}][${currentResponseId}] cancel reason: InterruptionValidator validated signal word → response.create`);
              if (openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify({ type: 'response.create' }));
              }
            } else if (!bargeInActive && !awaitingTranscript && !interruptionPending) {
              socket.send(JSON.stringify({ type: 'state', state: 'listening' }));
            }
            break;

          case 'input_audio_buffer.speech_started': {
            // ── Echo gate (checked first, before ALL other logic) ──────────────
            // During AI audio playback the speaker output is picked up by the mic.
            // WebAudio echoCancellation does not always have the WebAudio output as
            // its reference signal, so echo leaks through as apparent user speech.
            //
            // Two-layer protection:
            //   Layer 1 (streaming): aiSpeakingStartMs is rolled on every audio
            //     delta, so it stays < BARGE_IN_PROTECTION_MS from the last chunk
            //     for the entire streaming phase.
            //   Layer 2 (drain): aiPlaybackEndsMs covers the period after streaming
            //     ends but before the buffered audio finishes playing.
            const nowMs = Date.now();
            const sinceLastChunk = aiSpeakingStartMs ? nowMs - aiSpeakingStartMs : Infinity;
            const audioDraining  = aiPlaybackEndsMs !== null && nowMs < aiPlaybackEndsMs;

            console.log(
              `[CORR][${connId}][${currentResponseId}] speech_started` +
              ` responseInProgress=${responseInProgress}` +
              ` sinceLastChunk=${sinceLastChunk === Infinity ? 'inf' : Math.round(sinceLastChunk)}ms` +
              ` audioDraining=${audioDraining}` +
              (aiPlaybackEndsMs ? ` drainLeft=${Math.round(aiPlaybackEndsMs - nowMs)}ms` : '') +
              ` bargeInTimer=${bargeInTimer !== null}`
            );

            if (sinceLastChunk < BARGE_IN_PROTECTION_MS) {
              console.log(`[CORR][${connId}][${currentResponseId}] speech_started BLOCKED — echo layer1: ${Math.round(sinceLastChunk)}ms since last chunk (threshold=${BARGE_IN_PROTECTION_MS}ms)`);
              break;
            }
            if (audioDraining) {
              const msLeft = Math.round(aiPlaybackEndsMs! - nowMs);
              console.log(`[CORR][${connId}][${currentResponseId}] speech_started BLOCKED — echo layer2: drain ${msLeft}ms remaining`);
              break;
            }

            if (!responseInProgress) {
              console.log(`[CORR][${connId}][${currentResponseId}] speech_started ALLOWED — normal turn, AI idle`);
              speechStartedAt = Date.now();
              socket.send(JSON.stringify({ type: 'state', state: 'user_speaking' }));
              break;
            }

            if (bargeInTimer) {
              console.log(`[CORR][${connId}][${currentResponseId}] speech_started SKIPPED — barge-in timer already running`);
              break;
            }

            speechStartedAt = Date.now();
            const timerMs = BARGE_IN_CONFIRM_MS + SILENCE_DURATION_MS; // 1400ms
            console.log(`[CORR][${connId}][${currentResponseId}] speech_started BARGE-IN — starting ${timerMs}ms window (AI generating)`);
            bargeInTimer = setTimeout(() => {
              bargeInTimer = null;
              bargeInActive = true;
              console.log(`[CORR][${connId}][${currentResponseId}] *** CANCEL FIRED *** reason=barge-in-confirmed (≥${BARGE_IN_CONFIRM_MS}ms actual speech)`);
              if (listeningTimer) { clearTimeout(listeningTimer); listeningTimer = null; }
              socket.send(JSON.stringify({ type: 'flush_audio' }));
              socket.send(JSON.stringify({ type: 'state', state: 'user_speaking' }));
              if (openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify({ type: 'response.cancel' }));
              }
            }, timerMs);
            break;
          }

          case 'input_audio_buffer.speech_stopped': {
            speechStoppedAt = Date.now();

            if (bargeInTimer) {
              // Timer hasn't fired yet — actual speech duration < BARGE_IN_CONFIRM_MS (600ms).
              // This means the user made a short sound while the AI was speaking.
              // Don't cancel the AI via timer, but DO check the transcript: short words
              // like "нет" or "стоп" are valid interruptions even though they're brief.
              clearTimeout(bargeInTimer);
              bargeInTimer = null;

              const observedMs = speechStoppedAt - (speechStartedAt ?? speechStoppedAt);
              const actualMs   = Math.max(0, observedMs - SILENCE_DURATION_MS);
              console.log(`[VoiceRT][${connId}] speech_stopped — short sound (~${actualMs}ms actual) during AI speech — checking transcript for interruption intent`);

              // Mark as interruption-pending: transcript handler runs InterruptionValidator
              awaitingTranscript   = true;
              interruptionPending  = true;
              // speechStartedAt / speechStoppedAt kept for InterruptionValidator duration check
              break;
            }

            // Timer already fired (bargeInActive=true) or AI was not speaking (normal turn).
            awaitingTranscript = true;

            if (responseInProgress) {
              // bargeInActive=true: response.cancel was sent by timer; response.cancelled
              // may or may not have arrived yet. Keep userSpeechPending for safety.
              userSpeechPending = true;
              console.log(`[VoiceRT][${connId}] speech_stopped — barge-in in flight, awaiting transcript`);
            } else {
              console.log(`[VoiceRT][${connId}] speech_stopped — awaiting transcript for TurnValidator`);
            }
            break;
          }

          // GA API: audio delta renamed from response.audio.delta
          case 'response.output_audio.delta': {
            const b64 = String(event['delta'] ?? '');
            if (b64 && socket.readyState === WebSocket.OPEN) {
              const audioChunk = Buffer.from(b64, 'base64');
              responseTotalAudioBytes += audioChunk.length;
              audioDeltaCount++;
              aiSpeakingStartMs = Date.now();
              if (!speakingNotified) {
                speakingNotified = true;
                responseFirstAudioTs = Date.now();
                socket.send(JSON.stringify({ type: 'state', state: 'speaking' }));
                console.log(`[CORR][${connId}][${currentResponseId}] first audio delta — state:speaking`);
              }
              socket.send(audioChunk);
            }
            break;
          }

          // GA API: audio done renamed from response.audio.done
          case 'response.output_audio.done': {
            // OpenAI streams audio 6-7x faster than real-time playback speed.
            // By the time audio.done fires, the browser has only played
            // (streamingMs) worth of audio; the remaining (playbackMs - streamingMs)
            // is still buffered in PCM16Player and will play at 24kHz real-time.
            // We must hold state:listening until that buffer drains completely,
            // or VAD will trigger on the user's mic while the AI is still speaking.
            const playbackMs = Math.round((responseTotalAudioBytes / 48000) * 1000);
            const streamingMs = responseFirstAudioTs ? Date.now() - responseFirstAudioTs : 0;
            const remainingMs = Math.max(0, playbackMs - streamingMs);
            // 200ms safety buffer after the last sample clears the audio graph
            const drainDelayMs = Math.max(200, remainingMs + 200);
            // Track when the browser will finish playing buffered audio.
            // speech_started events before this timestamp are acoustic echo — blocked.
            aiPlaybackEndsMs = Date.now() + drainDelayMs;
            console.log(
              `[CORR][${connId}][${currentResponseId}] response.output_audio.done` +
              ` — deltas=${audioDeltaCount} bytes=${responseTotalAudioBytes} playback=${playbackMs}ms` +
              ` stream=${streamingMs}ms remaining=${remainingMs}ms fallbackDrain=${drainDelayMs}ms`
            );
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'audio_generation_done', responseId: currentResponseId }));
            }
            // Fallback drain timer: if browser never sends playback_complete (e.g.
            // tab backgrounded), we still eventually transition to listening.
            listeningTimer = setTimeout(() => {
              listeningTimer = null;
              aiPlaybackEndsMs = null; // drain complete — echo protection lifted
              console.log(`[VOICE PLAYBACK][${connId}] fallback drain timer fired — buffer assumed drained`);
              console.log(`[VOICE STATE][${connId}] speaking → listening`);
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'state', state: 'listening' }));
              }
            }, drainDelayMs);
            break;
          }

          case 'conversation.item.input_audio_transcription.completed': {
            const text = String(event['transcript'] ?? '').trim();

            if (!awaitingTranscript) {
              // Not waiting for validation (user_text test-mode or unexpected event)
              if (text) {
                transcriptLines.push(`Клиент: ${text}`);
                turnCount++;
                socket.send(JSON.stringify({ type: 'transcript', role: 'user', text, delta: false }));
              }
              break;
            }

            awaitingTranscript = false;
            userSpeechPending  = false;
            const tStart = speechStartedAt ?? speechStoppedAt ?? Date.now();
            const tStop  = speechStoppedAt ?? Date.now();
            speechStartedAt = null;
            speechStoppedAt = null;

            // ── Path A: short sound during AI speech → InterruptionValidator ───
            if (interruptionPending) {
              interruptionPending = false;

              const iv = validateInterruption({ transcript: text, speechStartedAt: tStart, speechStoppedAt: tStop });
              console.log(`[VoiceRT][${connId}] InterruptionValidator: ${iv.valid ? 'VALID' : 'INVALID'} — ${iv.reason}`);

              if (!iv.valid) {
                // Noise / filler / no signal — AI continues or drain timer handles state
                if (!responseInProgress) {
                  // AI already finished on its own — go to listening
                  socket.send(JSON.stringify({ type: 'state', state: 'listening' }));
                }
                break;
              }

              // Valid interruption intent — cancel AI if it's still speaking
              if (responseInProgress) {
                console.log(`[CORR][${connId}][${currentResponseId}] *** CANCEL FIRED *** reason=InterruptionValidator transcript="${text}"`);
                transcriptValidatedResponse = true;
                if (listeningTimer) { clearTimeout(listeningTimer); listeningTimer = null; }
                socket.send(JSON.stringify({ type: 'flush_audio' }));
                socket.send(JSON.stringify({ type: 'state', state: 'user_speaking' }));
                if (openaiWs.readyState === WebSocket.OPEN) {
                  openaiWs.send(JSON.stringify({ type: 'response.cancel' }));
                }
                // Show transcript in UI (the word that triggered interruption)
                if (text) {
                  transcriptLines.push(`Клиент: ${text}`);
                  turnCount++;
                  socket.send(JSON.stringify({ type: 'transcript', role: 'user', text, delta: false }));
                }
              } else {
                // AI already finished — treat as a normal turn via TurnValidator
                const tv = validateTurn({ transcript: text, speechStartedAt: tStart, speechStoppedAt: tStop });
                console.log(`[VoiceRT][${connId}] TurnValidator (post-AI): ${tv.valid ? 'VALID' : 'INVALID'} — ${tv.reason}`);
                if (!tv.valid) {
                  socket.send(JSON.stringify({ type: 'state', state: 'listening' }));
                  break;
                }
                if (text) {
                  transcriptLines.push(`Клиент: ${text}`);
                  turnCount++;
                  socket.send(JSON.stringify({ type: 'transcript', role: 'user', text, delta: false }));
                }
                const domA = checkVoiceDomain(text);
                console.log(`[VoiceRT][${connId}] DomainGuard (post-AI): ${domA.allowed ? 'ALLOWED' : `BLOCKED (${domA.blockedBy})`}`);
                socket.send(JSON.stringify({ type: 'state', state: 'thinking' }));
                responseInProgress = true;
                if (openaiWs.readyState === WebSocket.OPEN) {
                  openaiWs.send(domA.allowed ? JSON.stringify({ type: 'response.create' }) : OFF_TOPIC_RESPONSE_CREATE);
                }
              }
              break;
            }

            // ── Path B: confirmed barge-in or normal turn → TurnValidator ─────
            bargeInActive = false;

            const validation = validateTurn({ transcript: text, speechStartedAt: tStart, speechStoppedAt: tStop });
            console.log(`[VoiceRT][${connId}] TurnValidator: ${validation.valid ? 'VALID' : 'INVALID'} — ${validation.reason}`);

            if (!validation.valid) {
              socket.send(JSON.stringify({ type: 'state', state: 'listening' }));
              break;
            }

            if (text) {
              transcriptLines.push(`Клиент: ${text}`);
              turnCount++;
              socket.send(JSON.stringify({ type: 'transcript', role: 'user', text, delta: false }));
            }

            if (!responseInProgress) {
              const domB = checkVoiceDomain(text);
              console.log(`[VoiceRT][${connId}] DomainGuard: ${domB.allowed ? 'ALLOWED' : `BLOCKED (${domB.blockedBy})`}`);
              socket.send(JSON.stringify({ type: 'state', state: 'thinking' }));
              responseInProgress = true;
              if (openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(domB.allowed ? JSON.stringify({ type: 'response.create' }) : OFF_TOPIC_RESPONSE_CREATE);
              }
            }
            break;
          }

          // GA API: transcript delta renamed from response.audio_transcript.delta
          case 'response.output_audio_transcript.delta': {
            const delta = String(event['delta'] ?? '');
            if (delta && !transcriptViolationDetected) {
              partialTranscript += delta;
              const violation = checkAuthorityViolation(partialTranscript);
              if (violation) {
                transcriptViolationDetected = true;
                console.error(`[AUTHORITY][${connId}][${currentResponseId}] *** VIOLATION *** forbidden phrase "${violation}" — cancelling and regenerating`);
                if (openaiWs.readyState === WebSocket.OPEN) {
                  openaiWs.send(JSON.stringify({ type: 'response.cancel' }));
                }
                socket.send(JSON.stringify({ type: 'flush_audio' }));
              } else {
                socket.send(JSON.stringify({ type: 'transcript', role: 'assistant', text: delta, delta: true }));
              }
            }
            break;
          }

          // GA API: transcript done renamed from response.audio_transcript.done
          case 'response.output_audio_transcript.done': {
            const text = String(event['transcript'] ?? '').trim();
            // *** CRITICAL CORRELATION POINT ***
            // This is the FULL text OpenAI generated. Compare with what was heard.
            // If this text is complete but audio cuts → frontend/playback bug.
            // If this text also cuts → OpenAI generation bug or backend cancel.
            console.log(`[CORR][${connId}][${currentResponseId}] *** FULL OPENAI TRANSCRIPT *** "${text}"`);
            if (text) {
              transcriptLines.push(`Оператор: ${text}`);
              socket.send(JSON.stringify({ type: 'transcript', role: 'assistant', text, delta: false }));
            }
            break;
          }

          case 'response.function_call_arguments.delta': {
            pendingCallId   = String(event['call_id']  ?? pendingCallId  ?? '');
            pendingToolName = String(event['name']      ?? pendingToolName ?? '');
            pendingToolArgs += String(event['delta']    ?? '');
            break;
          }

          case 'response.function_call_arguments.done': {
            const callId   = String(event['call_id']     ?? pendingCallId  ?? '');
            const toolName = String(event['name']        ?? pendingToolName ?? '');
            const argsStr  = String(event['arguments']   ?? pendingToolArgs ?? '{}');

            pendingCallId   = null;
            pendingToolName = null;
            pendingToolArgs = '';

            let toolArgs: Record<string, unknown> = {};
            try { toolArgs = JSON.parse(argsStr) as Record<string, unknown>; } catch { /* ignore */ }

            const toolResult = await handleRealtimeTool(toolName, toolArgs, tenant, sessionId);

            // Emit trace to browser for E2E test visibility
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: 'tool_trace',
                tool: toolName,
                args: toolArgs,
                result: toolResult,
                call_id: callId,
              }));
            }

            if (openaiWs.readyState === WebSocket.OPEN) {
              openaiWs.send(JSON.stringify({
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: callId, output: toolResult },
              }));
              // Guard against duplicate response.create — only create if no response is active.
              // If a response is already in progress (function call fired mid-response),
              // set pendingToolResult so response.done picks it up.
              if (!responseInProgress) {
                responseInProgress = true;
                openaiWs.send(JSON.stringify({ type: 'response.create' }));
              } else {
                pendingToolResult = true;
                console.log(`[VoiceRT][${connId}] tool result submitted — will create response after response.done`);
              }
            }
            break;
          }

          case 'error': {
            const errMsg = String((event['error'] as Record<string, unknown> | undefined)?.['message'] ?? 'OpenAI error');
            app.log.error({ event }, 'OpenAI Realtime error');
            socket.send(JSON.stringify({ type: 'error', message: errMsg }));
            break;
          }
        }
      });

      openaiWs.on('error', (err) => {
        console.error(`[VoiceRT][${connId}] OpenAI WS error`, err);
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'error', message: 'OpenAI connection error' }));
        }
      });

      openaiWs.on('close', (code, reason) => {
        console.log(`[VoiceRT][${connId}] OpenAI WS closed code=${code} reason=${reason.toString()}`);
        if (socket.readyState === WebSocket.OPEN) socket.close();
      });

      // ── Browser → Backend → OpenAI ────────────────────────────────────────
      // ws v8 note: isBinary is required to distinguish text (JSON) from binary (PCM16).
      // Buffer.isBuffer(data) is ALWAYS true in ws v8 — do NOT use it for this check.
      socket.on('message', async (data: WebSocket.RawData, isBinary: boolean) => {
        // Binary frame = raw PCM16 audio from mic → forward to OpenAI
        if (isBinary) {
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: (data as Buffer).toString('base64'),
            }));
          }
          return;
        }

        // Text frame = JSON control message (arrives as Buffer in ws v8)
        let msg: Record<string, unknown>;
        try { msg = JSON.parse((data as Buffer).toString()) as Record<string, unknown>; } catch { return; }
        const msgType = String(msg['type'] ?? '');

        if (msgType === 'end') {
          const durationMs = Date.now() - callStartMs;
          const fullTranscript = transcriptLines.join('\n');
          const wowSummary = await generateWowSummary(fullTranscript, durationMs);

          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'session_summary', data: wowSummary }));
          }

          saveRealtimeSession({ tenantId: tenant.id, sessionId, durationMs, turnCount, transcript: fullTranscript, wowSummary })
            .catch((err: unknown) => { console.error(`[VoiceRT][${connId}] Failed to save realtime session`, err); });

          if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
          return;
        }

        if (msgType === 'interrupt') {
          if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(JSON.stringify({ type: 'response.cancel' }));
          }
          return;
        }

        if (msgType === 'user_text') {
          // Text-input mode for E2E testing — bypasses audio VAD.
          const text = String(msg['text'] ?? '').trim();
          if (text && openaiWs.readyState === WebSocket.OPEN) {
            transcriptLines.push(`Клиент: ${text}`);
            turnCount++;
            socket.send(JSON.stringify({ type: 'transcript', role: 'user', text, delta: false }));
            openaiWs.send(JSON.stringify({
              type: 'conversation.item.create',
              item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
            }));
            if (!responseInProgress) {
              responseInProgress = true;
              openaiWs.send(JSON.stringify({ type: 'response.create' }));
            }
          }
          return;
        }

        if (msgType === 'playback_complete') {
          // Browser has confirmed all buffered audio has finished playing.
          // Cancel the fallback drain timer and transition to listening immediately.
          if (listeningTimer) { clearTimeout(listeningTimer); listeningTimer = null; }
          aiPlaybackEndsMs = null;
          console.log(`[VOICE PLAYBACK][${connId}] browser playback_complete → echo protection lifted → state:listening`);
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'state', state: 'listening' }));
          }
          return;
        }
      });

      // ── Cleanup ────────────────────────────────────────────────────────────
      socket.on('close', (code, reason) => {
        console.log(`[VoiceRT][${connId}] browser WS closed code=${code} reason=${reason.toString()}`);
        if (openaiWs.readyState === WebSocket.OPEN || openaiWs.readyState === WebSocket.CONNECTING) {
          openaiWs.close();
        }
      });

      socket.on('error', (err) => {
        console.error(`[VoiceRT][${connId}] browser WS error`, err);
        if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
      });
    })();
  });
}
