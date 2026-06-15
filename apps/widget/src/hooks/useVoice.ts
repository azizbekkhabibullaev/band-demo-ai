/**
 * Voice state machine for the Voice Banking Assistant.
 *
 * Manages: MediaRecorder (mic capture), Whisper STT, TTS playback.
 * Does NOT duplicate the chat pipeline — it calls onTranscribed(text)
 * which triggers the existing sendMessage() from useChat unchanged.
 */

import { useState, useRef, useCallback } from 'react';
import { transcribeVoice, synthesizeSpeech, trackVoiceSession } from '../api/client.ts';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface UseVoiceOptions {
  onTranscribed: (text: string) => void;  // bridge to useChat.sendMessage
  onSpeakingEnd: () => void;              // auto-restart listening after TTS
  sessionId: string | null;
}

export interface UseVoiceReturn {
  phase:          VoicePhase;
  isMuted:        boolean;
  lastTranscript: string;
  error:          string | null;
  startListening: () => Promise<void>;
  stopListening:  () => void;
  speakText:      (text: string) => Promise<void>;
  toggleMute:     () => void;
  reset:          (isLead?: boolean) => void;
}

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function useVoice({ onTranscribed, onSpeakingEnd, sessionId }: UseVoiceOptions): UseVoiceReturn {
  const [phase, setPhase]               = useState<VoicePhase>('idle');
  const [isMuted, setIsMuted]           = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [error, setError]               = useState<string | null>(null);

  const recorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const streamRef      = useRef<MediaStream | null>(null);
  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef    = useRef<string | null>(null);
  const mutedRef       = useRef(false);
  const voiceSessionId = useRef<string | undefined>(undefined);
  const startedAt      = useRef<number>(0);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startListening = useCallback(async () => {
    if (recorderRef.current?.state === 'recording') return;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      recorder.onstop = async () => {
        stopStream();
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        if (blob.size < 500) {
          // Silence / too short — ignore
          setPhase('idle');
          return;
        }
        setPhase('thinking');
        // Count this turn
        if (voiceSessionId.current) {
          void trackVoiceSession({ action: 'turn', voiceSessionId: voiceSessionId.current });
        }
        try {
          const text = await transcribeVoice(blob);
          if (!text.trim()) { setPhase('idle'); return; }
          setLastTranscript(text);
          onTranscribed(text);
          // Hold 'thinking' — VoiceModal calls speakText() when streaming completes
        } catch {
          setError('Не удалось распознать речь. Попробуйте ещё раз.');
          setPhase('error');
        }
      };

      recorder.start();
      setPhase('listening');

      // Start voice session on first listen
      if (!voiceSessionId.current && sessionId) {
        startedAt.current = Date.now();
        const vsId = await trackVoiceSession({ action: 'start', sessionId });
        voiceSessionId.current = vsId;
      }
    } catch (err) {
      const e = err as Error;
      setError(
        (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')
          ? 'Микрофон недоступен. Разрешите доступ в настройках браузера.'
          : 'Не удалось запустить микрофон.',
      );
      setPhase('error');
    }
  }, [onTranscribed, sessionId, stopStream]);

  const stopListening = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const speakText = useCallback(async (text: string) => {
    if (mutedRef.current) {
      setPhase('idle');
      onSpeakingEnd();
      return;
    }
    setPhase('speaking');
    try {
      const buf = await synthesizeSpeech(text);
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
        setPhase('idle');
        onSpeakingEnd();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setPhase('idle');
        onSpeakingEnd();
      };
      await audio.play();
    } catch {
      setPhase('idle');
      onSpeakingEnd();
    }
  }, [onSpeakingEnd]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      mutedRef.current = next;
      if (next && audioRef.current) audioRef.current.pause();
      return next;
    });
  }, []);

  const reset = useCallback((isLead = false) => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopStream();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    if (voiceSessionId.current) {
      void trackVoiceSession({
        action: 'end',
        voiceSessionId: voiceSessionId.current,
        durationMs: Date.now() - (startedAt.current || Date.now()),
        isLead,
      });
      voiceSessionId.current = undefined;
    }
    setPhase('idle');
    setError(null);
    setIsMuted(false);
    mutedRef.current = false;
    setLastTranscript('');
  }, [stopStream]);

  return { phase, isMuted, lastTranscript, error, startListening, stopListening, speakText, toggleMute, reset };
}
