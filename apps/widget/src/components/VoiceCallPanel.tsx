/**
 * VoiceCallPanel — Phase 2 hands-free call UI.
 *
 * Replaces the entire chat panel body (including Header) when a call is active.
 * VAD auto-detects speech; no button pressing required after the call starts.
 *
 * State flow:
 *   connecting → greeting (AI speaks first) → listening → recording →
 *   processing (Whisper + /api/chat SSE) → speaking (TTS) → listening → …
 *
 * The existing /api/chat pipeline is unchanged: every transcribed utterance
 * flows through sendMessage → SSE → messages[], which also updates the chat
 * history visible when the user returns to text mode.
 */

import { useEffect, useRef, type CSSProperties } from 'react';
import { useVoiceCall, type CallPhase } from '../hooks/useVoiceCall.ts';
import type { Message } from '../hooks/useChat.ts';

interface Props {
  onClose:     () => void;
  sendMessage: (text: string, sessionId: string, lang: string) => Promise<void>;
  messages:    Message[];
  isStreaming: boolean;
  sessionId:   string | null;
  lang:        string;
  displayName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const STATE_LABEL: Record<CallPhase, string> = {
  idle:       '',
  connecting: 'Подключаемся...',
  greeting:   'Приветствие...',
  listening:  'Слушаю...',
  recording:  'Слушаю...',
  processing: 'Обрабатываю...',
  speaking:   'Говорю...',
  ended:      'Звонок завершён',
};

const STATE_COLOR: Record<CallPhase, string> = {
  idle:       '#475569',
  connecting: '#60a5fa',
  greeting:   '#60a5fa',
  listening:  '#34d399',
  recording:  '#34d399',
  processing: '#fbbf24',
  speaking:   '#60a5fa',
  ended:      '#f87171',
};

// ── Waveform bars ─────────────────────────────────────────────────────────────

const BAR_COUNT = 24;
// Staggered animation delays for organic feel
const BAR_ANIM_SPEEDS = Array.from(
  { length: BAR_COUNT },
  (_, i) => (0.45 + (i % 5) * 0.07).toFixed(2),
);
const BAR_ANIM_DELAYS = Array.from(
  { length: BAR_COUNT },
  (_, i) => ((i * 0.042) % 0.55).toFixed(2),
);

function Waveform({ phase, vadLevel }: { phase: CallPhase; vadLevel: number }) {
  const isListening = phase === 'listening' || phase === 'recording';
  const isSpeaking  = phase === 'speaking'  || phase === 'greeting';

  return (
    <div className="flex items-center gap-[2.5px] h-9 select-none">
      {BAR_ANIM_SPEEDS.map((speed, i) => {
        let style: CSSProperties;

        if (isListening) {
          // VAD-reactive: centre bars grow more than edges
          const centre = (BAR_COUNT - 1) / 2;
          const dist   = Math.abs(i - centre) / centre;   // 0 at centre, 1 at edges
          const factor = (1 - dist * 0.65) * vadLevel;
          const h      = Math.max(4, Math.min(34, 4 + factor * 30));
          style = { height: `${h}px`, transition: 'height 0.07s ease-out' };
        } else if (isSpeaking) {
          style = {
            animation: `voice-bar ${speed}s ease-in-out infinite`,
            animationDelay: `${BAR_ANIM_DELAYS[i]}s`,
          };
        } else {
          style = { height: '4px' };
        }

        return (
          <div
            key={i}
            className={[
              'rounded-full w-[2.5px]',
              isListening          ? 'bg-emerald-400' :
              isSpeaking           ? 'bg-blue-400'    :
              phase === 'processing' ? 'bg-amber-400/30' :
              'bg-white/10',
            ].join(' ')}
            style={style}
          />
        );
      })}
    </div>
  );
}

// ── AI Avatar ─────────────────────────────────────────────────────────────────

function Avatar({ phase, displayName }: { phase: CallPhase; displayName: string }) {
  const initials   = displayName.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const isSpeaking  = phase === 'speaking'  || phase === 'greeting';
  const isListening = phase === 'listening' || phase === 'recording';
  const isBusy      = phase === 'processing' || phase === 'connecting';

  const gradient =
    isSpeaking  ? 'from-blue-500 to-blue-700' :
    isListening ? 'from-emerald-500 to-teal-700' :
    isBusy      ? 'from-amber-500 to-orange-600' :
    'from-slate-600 to-slate-800';

  const ringColor =
    isSpeaking  ? 'bg-blue-500/15' :
    isListening ? 'bg-emerald-500/15' :
    null;

  return (
    <div className="relative flex items-center justify-center w-28 h-28 shrink-0">
      {/* Pulse rings (speaking / listening only) */}
      {ringColor && (
        <>
          <div className={`absolute inset-0 rounded-full voice-ring ${ringColor}`} />
          <div className={`absolute inset-0 rounded-full voice-ring ${ringColor}`}
            style={{ animationDelay: '0.55s' }} />
        </>
      )}

      {/* Avatar disc */}
      <div className={[
        'w-24 h-24 rounded-full flex items-center justify-center shadow-2xl',
        'border-2 transition-colors duration-500',
        `bg-gradient-to-br ${gradient}`,
        isSpeaking  ? 'border-blue-400/25 voice-pulse'    :
        isListening ? 'border-emerald-400/25'              :
        'border-white/10',
      ].join(' ')}>
        {isBusy ? (
          // Spinner for connecting / processing
          <div className="w-8 h-8 rounded-full border-[3px] border-white/20 border-t-white voice-think" />
        ) : (
          <span className="text-white text-xl font-bold tracking-tight select-none">
            {initials}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Icon components ───────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6"/>
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  );
}

// Rotated phone icon = hang-up symbol
function HangUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 rotate-[135deg]">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07C9.36 17.5 6.8 14.96 5.15 12a19.79 19.79 0 01-3.07-8.67 2 2 0 011.99-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-white/50">
      <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H6l-4 4V5z" clipRule="evenodd"/>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function VoiceCallPanel({
  onClose, sendMessage, messages, isStreaming, sessionId, lang, displayName,
}: Props) {
  const lastHandledId = useRef<string | null>(null);

  const call = useVoiceCall({
    onTranscribed: (text) => { if (sessionId) void sendMessage(text, sessionId, lang); },
    sessionId,
    displayName,
  });

  // Auto-start call immediately on mount; end on unmount
  useEffect(() => {
    void call.startCall();
    return () => { call.endCall(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bridge: AI finishes streaming → trigger TTS playback
  useEffect(() => {
    if (call.phase !== 'processing') return;
    if (isStreaming) return;
    const lastAI = [...messages].reverse().find(
      m => m.role === 'assistant' && !m.streaming && m.content,
    );
    if (!lastAI || lastAI.id === lastHandledId.current) return;
    lastHandledId.current = lastAI.id;
    void call.speakText(lastAI.content);
  }, [call.phase, isStreaming, messages, call.speakText]);

  const stateColor = STATE_COLOR[call.phase] ?? '#475569';
  const isActive   = !['idle', 'ended'].includes(call.phase);

  function handleClose() {
    call.endCall();
    onClose();
  }

  return (
    <div className="
      flex-1 flex flex-col overflow-hidden
      bg-gradient-to-b from-[#090e1f] via-[#0b1428] to-[#060b18]
    ">

      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4
        border-b border-white/[0.06]">

        {/* Status badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-[5px] rounded-full
          bg-white/[0.05] border border-white/[0.08]">
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{
              background: stateColor,
              boxShadow: isActive ? `0 0 5px ${stateColor}90` : 'none',
            }}
          />
          <span className="text-[9px] font-semibold text-white/45 uppercase tracking-widest">
            {call.phase === 'ended'   ? 'Завершён'    :
             isActive                 ? 'В эфире'     :
             'Подключение'}
          </span>
        </div>

        {/* Live call timer */}
        {isActive && (
          <span className="text-[12.5px] font-mono tabular-nums text-white/35">
            {formatTimer(call.callDurationMs)}
          </span>
        )}

        {/* Back to chat */}
        <button
          onClick={handleClose}
          title="Вернуться в чат"
          className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12]
            transition-colors flex items-center justify-center gap-1">
          <ChatIcon />
        </button>
      </div>

      {/* ── Center — avatar + status + waveform ── */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 min-h-0">

        <Avatar phase={call.phase} displayName={displayName} />

        {/* Name + role */}
        <div className="text-center">
          <p className="text-white text-[15px] font-semibold leading-snug">{displayName}</p>
          <p className="text-white/30 text-[11px] mt-1">Виртуальный консультант</p>
        </div>

        {/* State label */}
        <div className="flex items-center gap-2 min-h-[20px]">
          <p
            className="text-[13px] font-medium transition-colors duration-300"
            style={{ color: stateColor }}>
            {STATE_LABEL[call.phase]}
          </p>
        </div>

        {/* Waveform — only during active states */}
        {isActive && (
          <Waveform phase={call.phase} vadLevel={call.vadLevel} />
        )}

        {/* Error */}
        {call.error && (
          <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 max-w-[280px]">
            <p className="text-[11.5px] text-red-400 text-center leading-snug">{call.error}</p>
          </div>
        )}
      </div>

      {/* ── Transcript — last exchange ── */}
      {(call.lastUserText || call.lastAiText) && (
        <div className="mx-5 mb-3 px-4 py-3 rounded-2xl
          bg-white/[0.04] border border-white/[0.06]
          space-y-2.5 max-h-[108px] overflow-y-auto">

          {call.lastUserText && (
            <div className="flex gap-2.5 items-start">
              <span className="text-emerald-400/65 text-[8.5px] font-semibold uppercase
                tracking-widest pt-[2px] shrink-0">Вы</span>
              <p className="text-white/50 text-[11px] leading-relaxed line-clamp-2">
                {call.lastUserText}
              </p>
            </div>
          )}

          {call.lastAiText && (
            <div className="flex gap-2.5 items-start">
              <span className="text-blue-400/65 text-[8.5px] font-semibold uppercase
                tracking-widest pt-[2px] shrink-0">ИИ</span>
              <p className="text-white/50 text-[11px] leading-relaxed line-clamp-3">
                {call.lastAiText}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="shrink-0 flex items-center justify-center gap-8 pt-3 pb-6
        border-t border-white/[0.05]">

        {/* Mute toggle */}
        <button
          onClick={call.toggleMute}
          title={call.isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          className={[
            'w-[52px] h-[52px] rounded-full flex items-center justify-center',
            'ring-1 transition-all duration-200',
            call.isMuted
              ? 'bg-red-500/20 text-red-400 ring-red-500/30'
              : 'bg-white/[0.07] text-white/50 ring-white/10 hover:bg-white/[0.13] hover:text-white/70',
          ].join(' ')}>
          {call.isMuted ? <MicOffIcon /> : <MicIcon />}
        </button>

        {/* End call — prominent red */}
        <button
          onClick={handleClose}
          title="Завершить звонок"
          className="w-[70px] h-[70px] rounded-full bg-red-500 hover:bg-red-600
            flex items-center justify-center
            shadow-2xl shadow-red-700/40
            ring-4 ring-red-500/20
            transition-all duration-200 active:scale-95">
          <HangUpIcon />
        </button>
      </div>

      {/* Footer hint */}
      <div className="shrink-0 pb-4 px-4">
        <p className="text-[9px] text-white/12 text-center">
          Всё сказанное отображается в чате · Только русский язык
        </p>
      </div>
    </div>
  );
}
