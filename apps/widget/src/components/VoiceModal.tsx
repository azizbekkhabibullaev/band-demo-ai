/**
 * VoiceModal — Premium voice banking assistant UI.
 *
 * Replaces the chat panel body when voice mode is active.
 * All messages (transcribed user speech + AI responses) flow through
 * the existing useChat hook — no duplicate state management.
 *
 * Phase 1: Russian only. No Uzbek support yet.
 */

import { useEffect, useRef } from 'react';
import { useVoice, type VoicePhase } from '../hooks/useVoice.ts';
import type { Message } from '../hooks/useChat.ts';

interface Props {
  isOpen:      boolean;
  onClose:     () => void;
  sendMessage: (text: string, sessionId: string, lang: string) => Promise<void>;
  messages:    Message[];
  isStreaming: boolean;
  sessionId:   string | null;
  lang:        string;
  displayName: string;
  hasLead:     boolean;
}

// ─── Status labels ─────────────────────────────────────────────────────────────
const PHASE_LABEL: Record<VoicePhase, string> = {
  idle:      'Нажмите микрофон',
  listening: 'Слушаю...',
  thinking:  'Думаю...',
  speaking:  'Говорю...',
  error:     'Ошибка',
};

// ─── Waveform bars ─────────────────────────────────────────────────────────────
const BAR_DELAYS = [0, 0.12, 0.24, 0.06, 0.18, 0.30, 0.09, 0.21, 0.15];

function WaveformBars({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-[4px]">
      {BAR_DELAYS.map((delay, i) => (
        <div
          key={i}
          className="w-[3.5px] rounded-full bg-white/90"
          style={{
            height: '5px',
            animation: active ? `voice-bar ${0.55 + (i % 3) * 0.12}s ease-in-out infinite` : undefined,
            animationDelay: active ? `${delay}s` : undefined,
          }}
        />
      ))}
    </div>
  );
}

// ─── Central orb ──────────────────────────────────────────────────────────────
function VoiceOrb({ phase }: { phase: VoicePhase }) {
  const gradients: Record<VoicePhase, string> = {
    idle:      'from-slate-600 to-slate-800',
    listening: 'from-blue-400 via-blue-500 to-blue-700',
    thinking:  'from-violet-500 via-blue-500 to-blue-700',
    speaking:  'from-emerald-400 via-teal-500 to-blue-600',
    error:     'from-red-500 to-red-700',
  };

  return (
    <div className="relative flex items-center justify-center w-36 h-36">
      {/* Pulse ring — visible while listening or speaking */}
      {(phase === 'listening' || phase === 'speaking') && (
        <>
          <div className={[
            'absolute inset-0 rounded-full voice-ring',
            phase === 'listening' ? 'bg-blue-500/25'   : 'bg-emerald-500/25',
          ].join(' ')} />
          <div className={[
            'absolute inset-0 rounded-full voice-ring',
            phase === 'listening' ? 'bg-blue-500/15'   : 'bg-emerald-500/15',
          ].join(' ')}
            style={{ animationDelay: '0.6s' }}
          />
        </>
      )}

      {/* Core orb */}
      <div className={[
        `relative w-28 h-28 rounded-full flex items-center justify-center shadow-2xl`,
        `bg-gradient-to-br ${gradients[phase]}`,
        phase === 'listening' ? 'voice-pulse' : '',
        phase === 'speaking'  ? 'voice-pulse' : '',
      ].join(' ')}>

        {(phase === 'listening' || phase === 'speaking') && (
          <WaveformBars active />
        )}

        {phase === 'thinking' && (
          <div className="w-9 h-9 rounded-full border-[3px] border-white/25 border-t-white voice-think" />
        )}

        {(phase === 'idle' || phase === 'error') && (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-white/50">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Icon helpers ──────────────────────────────────────────────────────────────
function MicIcon({ active }: { active: boolean }) {
  return active ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" fill="none" stroke="currentColor"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-white">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
    </svg>
  );
}

function MuteIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M11 5 6 9H2v6h4l5 4V5Z"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07C8.44 16.29 5.71 13.56 4 10.12"/>
      <path d="M22 22 2 2"/>
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function VoiceModal({
  isOpen, onClose, sendMessage, messages, isStreaming, sessionId, lang, displayName, hasLead,
}: Props) {
  const lastHandledId = useRef<string | null>(null);
  const autoStarted   = useRef(false);

  const { phase, isMuted, lastTranscript, error, startListening, stopListening, speakText, toggleMute, reset } =
    useVoice({
      onTranscribed: (text) => { if (sessionId) void sendMessage(text, sessionId, lang); },
      onSpeakingEnd: () => { void startListening(); },
      sessionId,
    });

  // When AI finishes streaming → synthesize TTS
  useEffect(() => {
    if (phase !== 'thinking') return;
    if (isStreaming) return;

    const lastAI = [...messages].reverse().find(
      m => m.role === 'assistant' && !m.streaming && m.content,
    );
    if (!lastAI || lastAI.id === lastHandledId.current) return;

    lastHandledId.current = lastAI.id;
    void speakText(lastAI.content);
  }, [phase, isStreaming, messages, speakText]);

  // Auto-start listening when modal opens
  useEffect(() => {
    if (isOpen && !autoStarted.current && phase === 'idle') {
      autoStarted.current = true;
      void startListening();
    }
    if (!isOpen) {
      autoStarted.current = false;
      reset(hasLead);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const lastAIText = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? '';

  const canPressMic = phase === 'listening' || phase === 'idle' || phase === 'error';

  return (
    <div className="
      flex flex-col overflow-hidden rounded-widget shadow-widget ring-1 ring-white/10
      bg-gradient-to-b from-[#0c1428] via-[#0e1a38] to-[#080e1d]
      max-sm:w-full sm:w-[400px] max-sm:h-[85svh] sm:h-[620px]
    ">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4
        border-b border-white/[0.07]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0
            bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5 text-white w-5 h-5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
            </svg>
          </div>
          <div>
            <p className="text-white text-[13.5px] font-semibold leading-tight">{displayName}</p>
            <p className="text-blue-400/80 text-[10.5px] mt-0.5">Голосовой помощник · Русский</p>
          </div>
        </div>
        <button
          onClick={() => { reset(hasLead); onClose(); }}
          className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/14 transition-colors
            flex items-center justify-center shrink-0">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white/70">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      {/* ── Orb + status ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
        <VoiceOrb phase={phase} />

        <div className="text-center space-y-1">
          <p className={[
            'text-[14px] font-semibold transition-colors duration-300',
            phase === 'listening' ? 'text-blue-300'   :
            phase === 'thinking'  ? 'text-violet-300' :
            phase === 'speaking'  ? 'text-emerald-300':
            phase === 'error'     ? 'text-red-400'    :
            'text-white/50',
          ].join(' ')}>
            {PHASE_LABEL[phase]}
          </p>
          {error && (
            <p className="text-[11px] text-red-400/90 max-w-[240px] text-center leading-snug">{error}</p>
          )}
        </div>

        {/* ── Transcript excerpt ── */}
        {(lastTranscript || lastAIText) && (
          <div className="w-full max-w-[320px] rounded-2xl bg-white/[0.05] border border-white/[0.08]
            px-4 py-3 space-y-2.5">
            {lastTranscript && (
              <div className="flex gap-2.5 items-start">
                <span className="text-blue-400 text-[9.5px] font-semibold uppercase tracking-widest
                  pt-[1px] shrink-0">Вы</span>
                <p className="text-white/65 text-[11.5px] leading-relaxed line-clamp-2">
                  {lastTranscript}
                </p>
              </div>
            )}
            {lastAIText && phase !== 'listening' && (
              <div className="flex gap-2.5 items-start">
                <span className="text-emerald-400 text-[9.5px] font-semibold uppercase tracking-widest
                  pt-[1px] shrink-0">ИИ</span>
                <p className="text-white/65 text-[11.5px] leading-relaxed line-clamp-3">
                  {lastAIText}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="shrink-0 flex items-center justify-center gap-5 pb-8 pt-4
        border-t border-white/[0.07]">
        {/* Mute */}
        <button
          onClick={toggleMute}
          title={isMuted ? 'Включить звук' : 'Выключить звук'}
          className={[
            'w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200',
            isMuted
              ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
              : 'bg-white/8 text-white/55 hover:bg-white/14',
          ].join(' ')}>
          <MuteIcon muted={isMuted} />
        </button>

        {/* Main mic button */}
        <button
          onClick={() => {
            if (phase === 'listening') { stopListening(); }
            else if (canPressMic)      { void startListening(); }
          }}
          disabled={phase === 'thinking' || phase === 'speaking'}
          title={phase === 'listening' ? 'Остановить запись' : 'Начать говорить'}
          className={[
            'w-[76px] h-[76px] rounded-full flex items-center justify-center',
            'shadow-2xl transition-all duration-200 active:scale-95',
            'disabled:opacity-35 disabled:cursor-not-allowed',
            phase === 'listening'
              ? 'bg-red-500 shadow-red-600/40 scale-105 ring-4 ring-red-500/20'
              : 'bg-blue-600 shadow-blue-700/50 hover:bg-blue-500',
          ].join(' ')}>
          <MicIcon active={phase === 'listening'} />
        </button>

        {/* End call */}
        <button
          onClick={() => { reset(hasLead); onClose(); }}
          title="Завершить"
          className="w-12 h-12 rounded-full bg-white/8 text-white/55
            hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center
            transition-all duration-200">
          <PhoneOffIcon />
        </button>
      </div>

      {/* ── Footer hint ── */}
      <div className="shrink-0 px-4 pb-4">
        <p className="text-[9.5px] text-white/20 text-center leading-tight">
          Всё сказанное голосом отображается в чате · Только русский язык
        </p>
      </div>
    </div>
  );
}
