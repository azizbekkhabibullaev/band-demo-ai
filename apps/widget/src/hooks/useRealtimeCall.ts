/**
 * useRealtimeCall — Production Realtime Voice state machine.
 *
 * StrictMode Fix A: Guard allows startCall() from 'ended' phase (not just 'idle').
 *   Rationale: React StrictMode fires cleanup → endCall() → sets phase='ended'.
 *   The re-mount's startCall() was blocked by phaseRef!=='idle'. Now it passes.
 *
 * StrictMode Fix B: Invocation ID (callIdRef).
 *   Each startCall() gets a unique ID. After every await, the async body checks
 *   whether a newer invocation superseded it. If so it frees resources and returns.
 *   Prevents zombie WS connections from the stale (StrictMode) first invocation.
 *
 * Debug logging: every lifecycle step is console.log'd with [VoiceCall] prefix
 *   so the browser console shows the exact state machine trace.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { RealtimeAudioPlayer } from './RealtimeAudioPlayer.js';

export type RealtimePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'thinking'
  | 'speaking'
  | 'ended';

export interface TranscriptLine {
  role: 'user' | 'assistant';
  text: string;
}

export interface WowSummary {
  duration_seconds: number;
  topic: string;
  interest_level: string;
  lead_status: 'hot' | 'warm' | 'cold' | 'none';
  sentiment: 'positive' | 'neutral' | 'negative';
  products_discussed: string[];
  next_action: string;
  key_signals: string[];
}

export interface UseRealtimeCallReturn {
  phase:           RealtimePhase;
  transcript:      TranscriptLine[];
  lastUserText:    string;
  lastAiText:      string;
  isMuted:         boolean;
  callDurationMs:  number;
  error:           string | null;
  wowSummary:      WowSummary | null;
  aiAmplitudeRef:  React.MutableRefObject<number>;
  micAmplitudeRef: React.MutableRefObject<number>;
  startCall:       () => Promise<void>;
  endCall:         () => void;
  toggleMute:      () => void;
  interrupt:       () => void;
}

interface Options {
  tenantId: string;
  sessionId: string | null;
  onTranscriptLine?: (line: TranscriptLine) => void;
}

// ── Lifecycle debug logger ────────────────────────────────────────────────────

const bootMs = Date.now();

function voiceLog(step: string, detail?: unknown): void {
  const elapsed = Date.now() - bootMs;
  if (detail !== undefined) {
    console.log(`[VoiceCall +${elapsed}ms] ${step}`, detail);
  } else {
    console.log(`[VoiceCall +${elapsed}ms] ${step}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBackendWsUrl(tenantId: string, sessionId: string | null): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const port = import.meta.env.VITE_BACKEND_PORT ?? '3000';
  const params = new URLSearchParams({ tenantId });
  if (sessionId) params.set('sessionId', sessionId);
  return `${proto}//${host}:${port}/ws/voice/realtime?${params.toString()}`;
}

function isDemoMode(): boolean {
  return new URLSearchParams(window.location.search).has('voice-demo');
}

// ── Demo mode simulation ──────────────────────────────────────────────────────

async function runDemo(opts: {
  setPhase: (p: RealtimePhase) => void;
  addLine:  (l: TranscriptLine) => void;
  setWow:   (s: WowSummary) => void;
  isCancelled: () => boolean;
}): Promise<void> {
  const { setPhase, addLine, setWow, isCancelled } = opts;
  const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  const script: { role: 'user' | 'assistant'; text: string; wait: number }[] = [
    { role: 'assistant', text: 'Здравствуйте! Вас приветствует оператор Ipoteka Bank. Чем могу помочь?', wait: 2000 },
    { role: 'user',      text: 'Меня интересует ипотека на покупку квартиры.', wait: 2500 },
    { role: 'assistant', text: 'Хорошо, у нас есть программы для первичного и вторичного рынка, срок до 25 лет. Какую сумму рассматриваете?', wait: 3000 },
    { role: 'user',      text: 'Примерно 400 миллионов сум, первоначальный взнос готов внести 20%.', wait: 2500 },
    { role: 'assistant', text: 'Понимаю. Хотите оставить заявку? Запишу ваши данные и наш специалист свяжется в течение дня.', wait: 3000 },
    { role: 'user',      text: 'Да, пожалуйста. Меня зовут Алишер, номер 998901234567.', wait: 2500 },
    { role: 'assistant', text: 'Алишер, заявка принята. Наш ипотечный консультант позвонит вам в ближайшее время.', wait: 2000 },
    { role: 'user',      text: 'Спасибо!', wait: 1500 },
    { role: 'assistant', text: 'Пожалуйста! До свидания.', wait: 1000 },
  ];

  for (const line of script) {
    if (isCancelled()) return;
    if (line.role === 'user') {
      setPhase('user_speaking');
      await delay(800);
      if (isCancelled()) return;
      setPhase('thinking');
      await delay(500);
    } else {
      setPhase('speaking');
    }
    if (isCancelled()) return;
    addLine({ role: line.role, text: line.text });
    await delay(line.wait);
    if (line.role === 'assistant') setPhase('listening');
  }

  if (!isCancelled()) {
    setWow({
      duration_seconds: 25,
      topic: 'Ипотека на вторичное жильё',
      interest_level: 'Высокий',
      lead_status: 'hot',
      sentiment: 'positive',
      products_discussed: ['Ипотека'],
      next_action: 'Перезвонить Алишеру в течение рабочего дня',
      key_signals: ['Назвал имя и телефон', 'Готов внести 20% взнос', 'Чёткая сумма 400 млн'],
    });
    setPhase('ended');
  }
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useRealtimeCall({ tenantId, sessionId, onTranscriptLine }: Options): UseRealtimeCallReturn {
  const [phase, setPhaseState]      = useState<RealtimePhase>('idle');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [lastUserText, setLastUserText]   = useState('');
  const [lastAiText,   setLastAiText]     = useState('');
  const [isMuted,      setIsMuted]        = useState(false);
  const [callDurationMs, setCallDurationMs] = useState(0);
  const [error,        setError]          = useState<string | null>(null);
  const [wowSummary,   setWowSummary]     = useState<WowSummary | null>(null);

  const phaseRef      = useRef<RealtimePhase>('idle');
  const isMutedRef    = useRef(false);
  const endedRef      = useRef(false);
  const isStartingRef = useRef(false);

  // Fix B: invocation counter — each startCall() gets a unique ID.
  // The async body checks this after every await to detect if it was superseded.
  const callIdRef = useRef(0);

  const wsRef       = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef  = useRef<AudioWorkletNode | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const playerRef   = useRef<RealtimeAudioPlayer | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMsRef  = useRef(0);
  const pendingAiTextRef = useRef('');
  const demoCancelRef    = useRef(false);

  const aiAmplitudeRef  = useRef<number>(0);
  const micAmplitudeRef = useRef<number>(0);

  const setPhase = useCallback((p: RealtimePhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const addTranscriptLine = useCallback((line: TranscriptLine) => {
    setTranscript(prev => [...prev, line]);
    if (line.role === 'user') setLastUserText(line.text);
    else setLastAiText(line.text);
    onTranscriptLine?.(line);
  }, [onTranscriptLine]);

  function cleanup(): void {
    voiceLog('cleanup() called', { phase: phaseRef.current, callId: callIdRef.current });
    endedRef.current   = true;
    isStartingRef.current = false;
    demoCancelRef.current = true;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    workletRef.current?.disconnect();
    workletRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current?.state !== 'closed') void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    aiAmplitudeRef.current  = 0;
    micAmplitudeRef.current = 0;
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    }
  }

  const startCall = useCallback(async () => {
    // Fix A: allow restart from 'ended' (happens after StrictMode cleanup).
    // 'idle' = first call ever.  'ended' = StrictMode cleanup poisoned the phase.
    // Anything else (connecting/listening/speaking/thinking/user_speaking) = live call → block.
    if (isStartingRef.current || (phaseRef.current !== 'idle' && phaseRef.current !== 'ended')) {
      voiceLog('startCall() blocked', { isStarting: isStartingRef.current, phase: phaseRef.current });
      return;
    }
    isStartingRef.current = true;

    // Fix B: stamp this invocation. Any earlier async body will abort when it sees
    // callIdRef.current !== its own myCallId.
    const myCallId = ++callIdRef.current;
    voiceLog('startCall() begin', { callId: myCallId, prevPhase: phaseRef.current });

    endedRef.current   = false;
    demoCancelRef.current = false;
    setPhase('connecting');
    setError(null);
    setCallDurationMs(0);
    setTranscript([]);
    setLastUserText('');
    setLastAiText('');
    setWowSummary(null);
    pendingAiTextRef.current = '';
    aiAmplitudeRef.current   = 0;
    micAmplitudeRef.current  = 0;

    startMsRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setCallDurationMs(Date.now() - startMsRef.current);
    }, 500);

    voiceLog('LIFECYCLE → idle → connecting');

    // ── Demo mode ─────────────────────────────────────────────────────────────
    if (isDemoMode()) {
      voiceLog('demo mode activated');
      setPhase('listening');
      isStartingRef.current = false;
      await runDemo({
        setPhase,
        addLine: addTranscriptLine,
        setWow:  setWowSummary,
        isCancelled: () => demoCancelRef.current,
      });
      if (!demoCancelRef.current && timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // ── Real mode — mic + WS ──────────────────────────────────────────────────
    try {
      // ── STEP 1: Microphone ──────────────────────────────────────────────────
      voiceLog('LIFECYCLE → requesting microphone');
      // Explicit audio constraints:
      //   echoCancellation: true  — prevents AI voice from leaking back into mic
      //   noiseSuppression: true  — removes fan noise, keyboard clicks, desk taps
      //   autoGainControl: true   — normalises mic level so speaker echo stays below VAD threshold
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });

      // Fix B: abort if superseded
      if (callIdRef.current !== myCallId) {
        voiceLog('startCall() superseded after getUserMedia — aborting', { myCallId });
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;
      voiceLog('LIFECYCLE → microphone_ready', { tracks: stream.getTracks().length });

      // ── STEP 2: AudioContext ────────────────────────────────────────────────
      const ctx = new AudioContext({ sampleRate: 24000 });
      audioCtxRef.current = ctx;
      const srActual = ctx.sampleRate;
      // OpenAI outputs 24000 Hz PCM16. If the browser honours a different rate,
      // audio will play at srActual/24000 × speed (e.g. 48000 Hz → 2× too fast).
      if (srActual !== 24000) {
        voiceLog(`WARN sampleRate mismatch: requested 24000, got ${srActual} — audio will play at ${(srActual/24000).toFixed(2)}× speed`, { srActual });
      } else {
        voiceLog('AudioContext created', { sampleRate: srActual, state: ctx.state });
      }

      await ctx.audioWorklet.addModule('/pcm-processor.js');

      if (callIdRef.current !== myCallId) {
        voiceLog('startCall() superseded after audioWorklet.addModule — aborting', { myCallId });
        stream.getTracks().forEach(t => t.stop());
        void ctx.close();
        return;
      }
      voiceLog('AudioWorklet loaded');

      const source  = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, 'pcm-processor');
      workletRef.current = worklet;
      source.connect(worklet);

      // ── STEP 3: Audio player ────────────────────────────────────────────────
      const player = new RealtimeAudioPlayer(
        24000,
        (v) => { aiAmplitudeRef.current = v; },
        (responseId: string) => {
          // All buffered AI audio has finished playing — exact detection via
          // nextPlayTime timer, not onended event tracking.
          voiceLog(`[CORR][${responseId}] player onDone — last sample played → listening`);
          aiAmplitudeRef.current = 0;
          setPhase('listening');
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'playback_complete', responseId }));
          }
        },
      );
      playerRef.current = player;
      await player.resume();

      if (callIdRef.current !== myCallId) {
        voiceLog('startCall() superseded after player.resume — aborting', { myCallId });
        stream.getTracks().forEach(t => t.stop());
        player.stop();
        void ctx.close();
        return;
      }
      voiceLog('RealtimeAudioPlayer ready', { audioCtxState: ctx.state });

      // ── STEP 4: WebSocket ───────────────────────────────────────────────────
      const wsUrl = getBackendWsUrl(tenantId, sessionId);
      voiceLog('LIFECYCLE → connecting websocket', { url: wsUrl });

      const ws = new WebSocket(wsUrl);
      wsRef.current   = ws;
      ws.binaryType   = 'arraybuffer';

      ws.onopen = () => {
        // Drop if superseded — the new invocation will create its own WS
        if (callIdRef.current !== myCallId) {
          voiceLog('ws.onopen: superseded callId — closing zombie WS', { myCallId });
          ws.close();
          return;
        }
        voiceLog('LIFECYCLE → websocket_open');

        worklet.port.onmessage = (e: MessageEvent<Int16Array>) => {
          const data = e.data as Int16Array;
          let sumSq = 0;
          for (let i = 0; i < data.length; i++) {
            const norm = (data[i] ?? 0) / 32768;
            sumSq += norm * norm;
          }
          micAmplitudeRef.current = Math.min(1, Math.sqrt(sumSq / data.length) * 6);
          if (isMutedRef.current) return;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send((data as Int16Array).buffer);
          }
        };
      };

      ws.onmessage = (ev: MessageEvent<ArrayBuffer | string>) => {
        if (endedRef.current || callIdRef.current !== myCallId) return;

        if (ev.data instanceof ArrayBuffer) {
          playerRef.current?.enqueue(ev.data);
          return;
        }

        let msg: Record<string, unknown>;
        try { msg = JSON.parse(ev.data as string) as Record<string, unknown>; } catch { return; }

        const type = String(msg['type'] ?? '');
        voiceLog(`ws.onmessage: ${type}`, type === 'state' ? msg['state'] : undefined);

        switch (type) {
          case 'connected':
            voiceLog('LIFECYCLE → realtime_connected → listening');
            isStartingRef.current = false;
            setPhase('listening');
            break;

          case 'state': {
            const state = String(msg['state'] ?? '');
            if (state === 'user_speaking') {
              voiceLog('LIFECYCLE → user_speaking');
              setPhase('user_speaking');
            } else if (state === 'thinking') {
              voiceLog('LIFECYCLE → thinking');
              setPhase('thinking');
            } else if (state === 'listening') {
              voiceLog('LIFECYCLE → listening');
              aiAmplitudeRef.current = 0;
              setPhase('listening');
            } else if (state === 'speaking') {
              voiceLog('LIFECYCLE → greeting_started / speaking');
              setPhase('speaking');
            }
            break;
          }

          case 'flush_audio':
            voiceLog('flush_audio received — flushing player');
            playerRef.current?.flush();
            aiAmplitudeRef.current = 0;
            break;

          case 'transcript': {
            const role  = String(msg['role']  ?? '') as 'user' | 'assistant';
            const text  = String(msg['text']  ?? '');
            const delta = Boolean(msg['delta']);
            if (role === 'assistant') {
              if (delta) {
                pendingAiTextRef.current += text;
              } else {
                const finalText = pendingAiTextRef.current || text;
                pendingAiTextRef.current = '';
                if (finalText) addTranscriptLine({ role: 'assistant', text: finalText });
              }
            } else if (!delta && text) {
              addTranscriptLine({ role: 'user', text });
            }
            break;
          }

          case 'session_summary': {
            voiceLog('LIFECYCLE → session_summary → ended');
            const data = msg['data'] as WowSummary | undefined;
            if (data) setWowSummary(data);
            setPhase('ended');
            cleanup();
            break;
          }

          case 'audio_generation_done': {
            const rId = String(msg['responseId'] ?? 'unknown');
            voiceLog(`[CORR][${rId}] audio_generation_done — all chunks received, starting drain timer`);
            playerRef.current?.markServerDone(rId);
            break;
          }

          case 'error': {
            const errText = String((msg as Record<string, unknown>)['message'] ?? 'Ошибка соединения');
            voiceLog('ws error event', errText);
            setError(errText);
            break;
          }
        }
      };

      ws.onerror = (ev) => {
        voiceLog('ws.onerror', ev);
        if (callIdRef.current !== myCallId) return;
        setError('Ошибка WebSocket соединения.');
      };

      ws.onclose = (ev) => {
        voiceLog('ws.onclose', { code: ev.code, reason: ev.reason, wasClean: ev.wasClean });
        if (callIdRef.current !== myCallId) return;
        if (!endedRef.current && phaseRef.current !== 'ended') {
          voiceLog('LIFECYCLE → unexpected ws close → ended');
          setPhase('ended');
          cleanup();
        }
      };

    } catch (err) {
      const e = err as Error;
      voiceLog('startCall() caught error', { name: e.name, message: e.message });
      if (callIdRef.current !== myCallId) return; // superseded; don't pollute state
      isStartingRef.current = false;
      setError(
        e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError'
          ? 'Доступ к микрофону запрещён. Разрешите в настройках браузера.'
          : 'Не удалось начать звонок. Попробуйте ещё раз.',
      );
      setPhase('idle');
      cleanup();
    }
  }, [tenantId, sessionId, setPhase, addTranscriptLine]);

  const endCall = useCallback(() => {
    voiceLog('endCall() called', { phase: phaseRef.current, wsState: wsRef.current?.readyState });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      voiceLog('endCall() → sending end message, waiting 3s for WOW summary');
      wsRef.current.send(JSON.stringify({ type: 'end' }));
      setTimeout(() => { cleanup(); }, 3000);
    } else {
      // WS not yet open (e.g. StrictMode cleanup fires before connection established).
      // Do NOT set phase='ended' here — the re-mount's startCall() needs phase to be
      // either 'idle' or 'ended'. We set 'ended' only when there was a real call.
      // Exception: if we were already past 'connecting' (mic acquired, ws created),
      // then yes — mark ended.
      if (phaseRef.current !== 'connecting' && phaseRef.current !== 'idle') {
        voiceLog('LIFECYCLE → ended (no ws, non-connecting phase)');
        setPhase('ended');
      } else {
        voiceLog('endCall() during early startup — resetting to idle (not ended)');
        setPhase('idle');
      }
      cleanup();
    }
  }, [setPhase]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      isMutedRef.current = next;
      voiceLog('toggleMute', { muted: next });
      return next;
    });
  }, []);

  const interrupt = useCallback(() => {
    voiceLog('interrupt() called');
    playerRef.current?.flush();
    aiAmplitudeRef.current = 0;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
  }, []);

  useEffect(() => () => {
    voiceLog('useRealtimeCall unmount cleanup');
    cleanup();
  }, []);

  return {
    phase, transcript, lastUserText, lastAiText, isMuted, callDurationMs,
    error, wowSummary, aiAmplitudeRef, micAmplitudeRef,
    startCall, endCall, toggleMute, interrupt,
  };
}
