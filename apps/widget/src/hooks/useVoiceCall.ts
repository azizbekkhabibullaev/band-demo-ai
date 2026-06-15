/**
 * useVoiceCall — Phase 2 hands-free voice call state machine.
 *
 * Differences from Phase 1 useVoice (push-to-talk):
 *  - Voice Activity Detection (VAD) auto-detects speech/silence via Web Audio
 *  - AI greets the user first on call start
 *  - Continuous loop: listen → record → Whisper → existing /api/chat → TTS → listen
 *  - Barge-in protection: VAD paused while AI is speaking / processing
 *  - speakText() is called by the component when AI finishes streaming
 *
 * The existing /api/chat SSE pipeline is unchanged — onTranscribed bridges to
 * useChat.sendMessage exactly as Phase 1 did.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { transcribeVoice, synthesizeSpeech, trackVoiceSession } from '../api/client.ts';

export type CallPhase =
  | 'idle'        // not in a call
  | 'connecting'  // acquiring mic + audio context
  | 'greeting'    // AI greeting TTS playing
  | 'listening'   // VAD active, waiting for user to start speaking
  | 'recording'   // user is actively speaking (MediaRecorder running)
  | 'processing'  // Whisper + AI streaming in progress
  | 'speaking'    // AI TTS audio playing
  | 'ended';      // call terminated (brief state before → idle)

const VAD_THRESHOLD = 0.012;  // RMS energy level to count as speech
const PRE_SPEECH_MS = 250;    // energy must stay above threshold this long to start recording
const SILENCE_MS    = 1200;   // silence after speech triggers auto-send
const TICK_MS       = 50;     // VAD polling interval (20 checks/sec)

type VadState = 'silence' | 'pre_speech' | 'speaking' | 'post_speech';

interface UseVoiceCallOptions {
  onTranscribed: (text: string) => void;
  sessionId:     string | null;
  displayName:   string;
}

export interface UseVoiceCallReturn {
  phase:          CallPhase;
  isMuted:        boolean;
  callDurationMs: number;
  lastUserText:   string;
  lastAiText:     string;
  vadLevel:       number;        // 0–1, drives waveform animation
  error:          string | null;
  startCall:      () => Promise<void>;
  endCall:        () => void;
  toggleMute:     () => void;
  speakText:      (text: string) => Promise<void>;
}

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function useVoiceCall({
  onTranscribed, sessionId, displayName,
}: UseVoiceCallOptions): UseVoiceCallReturn {

  // ── React state (rendered values) ──────────────────────────────────────────
  const [phase,          setPhaseState]    = useState<CallPhase>('idle');
  const [isMuted,        setIsMuted]       = useState(false);
  const [callDurationMs, setCallDurationMs] = useState(0);
  const [lastUserText,   setLastUserText]  = useState('');
  const [lastAiText,     setLastAiText]    = useState('');
  const [vadLevel,       setVadLevel]      = useState(0);
  const [error,          setError]         = useState<string | null>(null);

  // ── Refs (mutable, never stale inside callbacks) ────────────────────────────
  const phaseRef     = useRef<CallPhase>('idle');
  const isMutedRef   = useRef(false);
  // Boolean flag used for ended checks — avoids TS narrowing on phaseRef.current
  const callEndedRef = useRef(false);

  // audio resources
  const streamRef   = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Float32Array<ArrayBuffer> matches AnalyserNode.getFloatTimeDomainData signature
  const vadDataRef  = useRef<Float32Array<ArrayBuffer> | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const audioRef    = useRef<HTMLAudioElement | null>(null);

  // timers
  const vadIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStartMsRef   = useRef(0);

  // VAD state machine (ref-based — no React state overhead)
  const vadStateRef      = useRef<VadState>('silence');
  const preSpeechStartRef = useRef<number | null>(null);
  const silenceStartRef   = useRef<number | null>(null);

  // analytics
  const voiceSessionIdRef = useRef<string | undefined>(undefined);

  // always-current callback ref to avoid stale closures in intervals
  const onTranscribedRef  = useRef(onTranscribed);
  onTranscribedRef.current = onTranscribed;

  // ── Stable setPhase (refs + stable React setter — safe with [] deps) ────────
  const setPhase = useCallback((p: CallPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  // ── Audio energy ──────────────────────────────────────────────────────────
  function getRMS(): number {
    if (!analyserRef.current || !vadDataRef.current) return 0;
    analyserRef.current.getFloatTimeDomainData(vadDataRef.current);
    let sum = 0;
    for (let i = 0; i < vadDataRef.current.length; i++) {
      sum += vadDataRef.current[i] * vadDataRef.current[i];
    }
    return Math.sqrt(sum / vadDataRef.current.length);
  }

  // ── MediaRecorder start / stop ─────────────────────────────────────────────
  function startRecording() {
    if (!streamRef.current) return;
    if (recorderRef.current?.state === 'recording') return;
    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current   = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.start();
    setPhase('recording');
  }

  function finishRecording() {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'recording') return;

    rec.onstop = async () => {
      const mimeType = rec.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size < 500 || callEndedRef.current) {
        if (!callEndedRef.current) setPhase('listening');
        return;
      }
      setPhase('processing');
      try {
        const text = await transcribeVoice(blob);
        if (!text.trim() || callEndedRef.current) {
          if (!callEndedRef.current) setPhase('listening');
          return;
        }
        setLastUserText(text);
        onTranscribedRef.current(text);   // → useChat.sendMessage → /api/chat SSE
        if (voiceSessionIdRef.current) {
          void trackVoiceSession({ action: 'turn', voiceSessionId: voiceSessionIdRef.current });
        }
        // stays in 'processing' — VoiceCallPanel calls speakText() when AI is done
      } catch {
        if (!callEndedRef.current) setPhase('listening');
      }
    };
    rec.stop();
  }

  // ── VAD tick — called every TICK_MS while call is active ──────────────────
  // All state accessed via refs → safe even if this closure is captured by an old setInterval.
  function vadTick() {
    const p = phaseRef.current;
    if (p !== 'listening' && p !== 'recording') return;
    if (isMutedRef.current) { setVadLevel(0); return; }

    const rms  = getRMS();
    setVadLevel(Math.min(1, rms / 0.04));

    const isSpeech = rms > VAD_THRESHOLD;
    const now      = Date.now();

    switch (vadStateRef.current) {
      case 'silence':
        if (isSpeech) {
          vadStateRef.current    = 'pre_speech';
          preSpeechStartRef.current = now;
        }
        break;

      case 'pre_speech':
        if (!isSpeech) {
          vadStateRef.current    = 'silence';
          preSpeechStartRef.current = null;
        } else if (now - (preSpeechStartRef.current ?? now) >= PRE_SPEECH_MS) {
          vadStateRef.current    = 'speaking';
          preSpeechStartRef.current = null;
          startRecording();
        }
        break;

      case 'speaking':
        if (!isSpeech) {
          vadStateRef.current   = 'post_speech';
          silenceStartRef.current = now;
        }
        break;

      case 'post_speech':
        if (isSpeech) {
          vadStateRef.current   = 'speaking';
          silenceStartRef.current = null;
        } else if (now - (silenceStartRef.current ?? now) >= SILENCE_MS) {
          vadStateRef.current   = 'silence';
          preSpeechStartRef.current = null;
          silenceStartRef.current   = null;
          finishRecording();
        }
        break;
    }
  }

  // ── Resource cleanup ───────────────────────────────────────────────────────
  function cleanup() {
    callEndedRef.current = true;
    if (vadIntervalRef.current)   { clearInterval(vadIntervalRef.current);   vadIntervalRef.current   = null; }
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (audioCtxRef.current?.state !== 'closed') void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    vadDataRef.current  = null;
    vadStateRef.current = 'silence';
    preSpeechStartRef.current = null;
    silenceStartRef.current   = null;
    setVadLevel(0);
  }

  // ── speakText — called by VoiceCallPanel when AI response is ready ─────────
  const speakText = useCallback(async (text: string) => {
    if (callEndedRef.current) return;
    setPhase('speaking');
    setLastAiText(text);

    try {
      const buf = await synthesizeSpeech(text);
      if (callEndedRef.current) return;

      const blob  = new Blob([buf], { type: 'audio/mpeg' });
      const url   = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      await new Promise<void>((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        if (isMutedRef.current) { URL.revokeObjectURL(url); resolve(); return; }
        audio.play().catch(() => resolve());
      });
    } catch {
      // TTS failed — fall through to resume listening
    }

    if (!callEndedRef.current) {
      vadStateRef.current = 'silence';
      setPhase('listening');
    }
  }, [setPhase]);

  // ── startCall ──────────────────────────────────────────────────────────────
  const startCall = useCallback(async () => {
    callEndedRef.current = false;
    setPhase('connecting');
    setError(null);
    setCallDurationMs(0);
    setLastUserText('');
    setLastAiText('');

    try {
      // 1. Mic permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      // 2. Web Audio context + VAD analyser
      const ctx      = new AudioContext();
      audioCtxRef.current = ctx;
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;
      vadDataRef.current  = new Float32Array(analyser.fftSize);

      // 3. Call timer
      callStartMsRef.current = Date.now();
      timerIntervalRef.current = setInterval(() => {
        setCallDurationMs(Date.now() - callStartMsRef.current);
      }, 500);

      // 4. AI greeting
      setPhase('greeting');
      const greeting = `Здравствуйте! Вас приветствует виртуальный консультант ${displayName}. Чем могу помочь?`;
      setLastAiText(greeting);
      try {
        const buf   = await synthesizeSpeech(greeting);
        if (callEndedRef.current) return;
        const blob  = new Blob([buf], { type: 'audio/mpeg' });
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        await new Promise<void>((res) => {
          audio.onended = () => { URL.revokeObjectURL(url); res(); };
          audio.onerror = () => { URL.revokeObjectURL(url); res(); };
          audio.play().catch(() => res());
        });
      } catch {
        // greeting TTS failed — continue to listening
      }

      if (callEndedRef.current) return;

      // 5. Start hands-free listening
      vadStateRef.current   = 'silence';
      setPhase('listening');
      vadIntervalRef.current = setInterval(vadTick, TICK_MS);

      // 6. Analytics
      if (sessionId) {
        const vsId = await trackVoiceSession({ action: 'start', sessionId });
        voiceSessionIdRef.current = vsId;
      }

    } catch (err) {
      const e = err as Error;
      setError(
        e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError'
          ? 'Доступ к микрофону запрещён. Разрешите в настройках браузера.'
          : 'Не удалось начать звонок. Попробуйте ещё раз.',
      );
      setPhase('idle');
      cleanup();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayName, sessionId, setPhase]);

  // ── endCall ────────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    const wasActive = phaseRef.current !== 'idle' && phaseRef.current !== 'ended';
    setPhase('ended');
    cleanup();
    if (wasActive && voiceSessionIdRef.current) {
      void trackVoiceSession({
        action:         'end',
        voiceSessionId: voiceSessionIdRef.current,
        durationMs:     Date.now() - callStartMsRef.current,
      });
      voiceSessionIdRef.current = undefined;
    }
    // brief "ended" state for exit animation, then reset
    setTimeout(() => {
      if (phaseRef.current === 'ended') {
        callEndedRef.current = false;
        setPhase('idle');
      }
    }, 1200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPhase]);

  // ── toggleMute ─────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      isMutedRef.current = next;
      if (next && audioRef.current) audioRef.current.pause();
      return next;
    });
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => () => {
    if (phaseRef.current !== 'idle') cleanup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    phase, isMuted, callDurationMs, lastUserText, lastAiText, vadLevel, error,
    startCall, endCall, toggleMute, speakText,
  };
}
