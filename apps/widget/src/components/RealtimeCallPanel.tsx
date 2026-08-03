/**
 * RealtimeCallPanel — Production Voice UI.
 *
 * Key upgrades over Phase 3:
 *  - Amplitude-driven waveform via requestAnimationFrame (not random CSS)
 *  - All 7 call states have distinct visual treatment
 *  - Latency indicator: if AI is thinking > 1.2s, shows "Анализирую запрос..."
 *  - Barge-in button now enabled whenever phase === 'speaking' (backend fixed)
 *  - Interrupt immediately silences local audio via player.flush()
 */

import { useEffect, useRef, useState } from 'react';
import { useRealtimeCall, type RealtimePhase, type WowSummary } from '../hooks/useRealtimeCall.ts';

interface Props {
  onClose:     () => void;
  tenantId:    string;
  sessionId:   string | null;
  displayName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimer(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const STATE_LABEL: Record<RealtimePhase, string> = {
  idle:          '',
  connecting:    'Подключение...',
  listening:     'Слушаю вас...',
  user_speaking: 'Слушаю вас...',
  thinking:      'Анализирую запрос...',
  speaking:      'Отвечаю...',
  ended:         'Звонок завершён',
};

const STATE_COLOR: Record<RealtimePhase, string> = {
  idle:          '#475569',
  connecting:    '#60a5fa',
  listening:     '#34d399',
  user_speaking: '#34d399',
  thinking:      '#fbbf24',
  speaking:      '#60a5fa',
  ended:         '#f87171',
};

// ── Amplitude-driven waveform ─────────────────────────────────────────────────

const BAR_COUNT = 20;

interface WaveformProps {
  phase:           RealtimePhase;
  aiAmplitudeRef:  React.MutableRefObject<number>;
  micAmplitudeRef: React.MutableRefObject<number>;
}

function Waveform({ phase, aiAmplitudeRef, micAmplitudeRef }: WaveformProps) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef  = useRef<number>(0);

  const isSpeaking  = phase === 'speaking';
  const isListening = phase === 'listening' || phase === 'user_speaking';
  const isThinking  = phase === 'thinking';

  // Colour class is purely CSS — only height is driven dynamically
  const barColor =
    isSpeaking  ? 'bg-blue-400'     :
    isListening ? 'bg-emerald-400'  :
    isThinking  ? 'bg-amber-400/40' :
    'bg-white/10';

  useEffect(() => {
    const CENTER = (BAR_COUNT - 1) / 2;

    const animate = (ts: number) => {
      const amplitude =
        isSpeaking  ? aiAmplitudeRef.current  :
        isListening ? micAmplitudeRef.current :
        0;

      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = barsRef.current[i];
        if (!bar) continue;

        const dist = Math.abs(i - CENTER) / CENTER;

        let h: number;
        if (isSpeaking) {
          // Centre bars taller; add per-bar shimmer so it looks alive even at low amplitude
          const shimmer = Math.sin(ts * 0.003 + i * 0.9) * 0.35 + 0.65;
          h = 3 + amplitude * 24 * (1 - dist * 0.55) * shimmer;
        } else if (isListening) {
          // Gentle mic reaction
          const shimmer = Math.sin(ts * 0.002 + i * 1.1) * 0.25 + 0.75;
          h = 3 + amplitude * 14 * (1 - dist * 0.6) * shimmer;
        } else if (isThinking) {
          // Slow breathing pulse
          h = 3 + Math.sin(ts * 0.0015 + i * 0.4) * 1.5;
        } else {
          h = 3;
        }

        bar.style.height = `${Math.max(3, h)}px`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, isSpeaking, isListening, isThinking, aiAmplitudeRef, micAmplitudeRef]);

  return (
    <div className="flex items-center gap-[3px] h-8 select-none">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          ref={el => { barsRef.current[i] = el; }}
          className={`rounded-full w-[2.5px] ${barColor}`}
          style={{ height: '3px' }}
        />
      ))}
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ phase, displayName }: { phase: RealtimePhase; displayName: string }) {
  const initials = displayName.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const isSpeaking  = phase === 'speaking';
  const isListening = phase === 'listening' || phase === 'user_speaking';
  const isBusy      = phase === 'thinking'  || phase === 'connecting';

  const gradient =
    isSpeaking  ? 'from-blue-500 to-blue-700'    :
    isListening ? 'from-emerald-500 to-teal-700' :
    isBusy      ? 'from-amber-500 to-orange-600' :
    'from-slate-600 to-slate-800';

  const ringColor =
    isSpeaking  ? 'bg-blue-500/12'    :
    isListening ? 'bg-emerald-500/12' :
    null;

  return (
    <div className="relative flex items-center justify-center w-28 h-28 shrink-0">
      {ringColor && (
        <>
          <div className={`absolute inset-0 rounded-full voice-ring ${ringColor}`} />
          <div className={`absolute inset-0 rounded-full voice-ring ${ringColor}`} style={{ animationDelay: '0.6s' }} />
        </>
      )}
      <div className={[
        'w-24 h-24 rounded-full flex items-center justify-center shadow-2xl',
        'border-2 transition-colors duration-500',
        `bg-gradient-to-br ${gradient}`,
        isSpeaking  ? 'border-blue-400/25 voice-pulse' :
        isListening ? 'border-emerald-400/25'           :
        'border-white/10',
      ].join(' ')}>
        {isBusy ? (
          <div className="w-8 h-8 rounded-full border-[3px] border-white/20 border-t-white voice-think" />
        ) : (
          <span className="text-white text-xl font-bold tracking-tight select-none">{initials}</span>
        )}
      </div>
    </div>
  );
}

// ── Latency indicator — shown when thinking > 1.2s ───────────────────────────

function LatencyDot() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-amber-400"
          style={{ animation: `voice-think 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

// ── WOW Summary Card ──────────────────────────────────────────────────────────

const LEAD_BADGE: Record<string, { label: string; color: string }> = {
  hot:  { label: 'HOT LEAD',  color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  warm: { label: 'WARM LEAD', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  cold: { label: 'COLD LEAD', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  none: { label: 'NO LEAD',   color: 'bg-white/5 text-white/30 border-white/10' },
};

const SENTIMENT_ICON: Record<string, string> = {
  positive: '😊',
  neutral:  '😐',
  negative: '😟',
};

function WowSummaryCard({ summary }: { summary: WowSummary }) {
  const lead = LEAD_BADGE[summary.lead_status] ?? LEAD_BADGE['none']!;
  const icon = SENTIMENT_ICON[summary.sentiment] ?? '😐';

  return (
    <div className="mx-4 mb-4 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
          Итоги звонка
        </span>
        <span className="text-[10px] text-white/25">
          {summary.duration_seconds}с
        </span>
      </div>

      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] text-white/80 font-medium leading-snug flex-1">
          {summary.topic}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${lead.color}`}>
            {lead.label}
          </span>
          <span className="text-sm">{icon}</span>
        </div>
      </div>

      {summary.products_discussed.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {summary.products_discussed.map(p => (
            <span key={p} className="text-[9px] text-blue-300/70 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
              {p}
            </span>
          ))}
        </div>
      )}

      {summary.key_signals.length > 0 && (
        <div className="space-y-0.5">
          {summary.key_signals.slice(0, 3).map((s, i) => (
            <p key={i} className="text-[10px] text-white/40 flex items-start gap-1.5">
              <span className="text-emerald-400/60 shrink-0">✓</span>
              {s}
            </p>
          ))}
        </div>
      )}

      {summary.next_action && (
        <p className="text-[10px] text-amber-400/70 border-t border-white/[0.06] pt-2">
          → {summary.next_action}
        </p>
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

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

function HangUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 rotate-[135deg]">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07C9.36 17.5 6.8 14.96 5.15 12a19.79 19.79 0 01-3.07-8.67 2 2 0 011.99-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  );
}

function InterruptIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <rect x="6" y="4" width="4" height="16" rx="1"/>
      <rect x="14" y="4" width="4" height="16" rx="1"/>
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

export function RealtimeCallPanel({ onClose, tenantId, sessionId, displayName }: Props) {
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  // Track how long we've been in 'thinking' state to show latency indicator
  const [showLatency, setShowLatency] = useState(false);
  const latencyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const call = useRealtimeCall({ tenantId, sessionId });

  useEffect(() => { void call.startCall(); return () => { call.endCall(); }; }, []);

  // Latency indicator: show after 1.2s in thinking state
  useEffect(() => {
    if (latencyTimerRef.current) {
      clearTimeout(latencyTimerRef.current);
      latencyTimerRef.current = null;
    }
    if (call.phase === 'thinking') {
      latencyTimerRef.current = setTimeout(() => setShowLatency(true), 1200);
    } else {
      setShowLatency(false);
    }
    return () => {
      if (latencyTimerRef.current) clearTimeout(latencyTimerRef.current);
    };
  }, [call.phase]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [call.transcript]);

  const isActive   = !['idle', 'ended'].includes(call.phase);
  const stateColor = STATE_COLOR[call.phase] ?? '#475569';

  function handleClose() {
    call.endCall();
    onClose();
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-[#090e1f] via-[#0b1428] to-[#060b18]">

      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5 px-2.5 py-[5px] rounded-full bg-white/[0.05] border border-white/[0.08]">
          <span
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: stateColor, boxShadow: isActive ? `0 0 5px ${stateColor}90` : 'none' }}
          />
          <span className="text-[9px] font-semibold text-white/45 uppercase tracking-widest">
            {call.phase === 'ended' ? 'Завершён' : isActive ? 'В эфире' : 'Подключение'}
          </span>
        </div>

        {isActive && (
          <span className="text-[12.5px] font-mono tabular-nums text-white/35">
            {formatTimer(call.callDurationMs)}
          </span>
        )}

        <button
          onClick={handleClose}
          title="Вернуться в чат"
          className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition-colors flex items-center justify-center">
          <ChatIcon />
        </button>
      </div>

      {/* ── Centre — avatar + status ── */}
      <div className="shrink-0 flex flex-col items-center gap-4 pt-6 pb-4 px-6">
        <Avatar phase={call.phase} displayName={displayName} />

        <div className="text-center">
          <p className="text-white text-[15px] font-semibold leading-snug">{displayName}</p>
          <p className="text-white/30 text-[11px] mt-0.5">Голосовой оператор · AI</p>
        </div>

        {/* State label + latency dots */}
        <div className="min-h-[22px] flex items-center gap-2">
          <p className="text-[13px] font-medium transition-colors duration-300" style={{ color: stateColor }}>
            {STATE_LABEL[call.phase]}
          </p>
          {showLatency && call.phase === 'thinking' && <LatencyDot />}
        </div>

        {isActive && (
          <Waveform
            phase={call.phase}
            aiAmplitudeRef={call.aiAmplitudeRef}
            micAmplitudeRef={call.micAmplitudeRef}
          />
        )}

        {call.error && (
          <div className="px-4 py-2.5 rounded-2xl bg-red-500/10 border border-red-500/20 max-w-[260px]">
            <p className="text-[11px] text-red-400 text-center leading-snug">{call.error}</p>
          </div>
        )}
      </div>

      {/* ── Live transcript scroll ── */}
      {call.transcript.length > 0 && call.phase !== 'ended' && (
        <div className="flex-1 overflow-y-auto mx-4 mb-3 px-3 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] space-y-2 min-h-0">
          {call.transcript.slice(-6).map((line, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className={[
                'text-[8px] font-bold uppercase tracking-widest pt-[2px] shrink-0',
                line.role === 'user' ? 'text-emerald-400/65' : 'text-blue-400/65',
              ].join(' ')}>
                {line.role === 'user' ? 'Вы' : 'ИИ'}
              </span>
              <p className="text-white/50 text-[11px] leading-relaxed">{line.text}</p>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      )}

      {/* ── WOW Summary (shown after call ends) ── */}
      {call.phase === 'ended' && call.wowSummary && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <WowSummaryCard summary={call.wowSummary} />
        </div>
      )}

      {/* ── Controls ── */}
      {call.phase !== 'ended' && (
        <div className="shrink-0 flex items-center justify-center gap-6 pt-3 pb-6 border-t border-white/[0.05]">

          {/* Mute */}
          <button
            onClick={call.toggleMute}
            title={call.isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            className={[
              'w-[52px] h-[52px] rounded-full flex items-center justify-center ring-1 transition-all duration-200',
              call.isMuted
                ? 'bg-red-500/20 text-red-400 ring-red-500/30'
                : 'bg-white/[0.07] text-white/50 ring-white/10 hover:bg-white/[0.13] hover:text-white/70',
            ].join(' ')}>
            {call.isMuted ? <MicOffIcon /> : <MicIcon />}
          </button>

          {/* Hang up */}
          <button
            onClick={handleClose}
            title="Завершить звонок"
            className="w-[70px] h-[70px] rounded-full bg-red-500 hover:bg-red-600
              flex items-center justify-center shadow-2xl shadow-red-700/40
              ring-4 ring-red-500/20 transition-all duration-200 active:scale-95">
            <HangUpIcon />
          </button>

          {/* Barge-in: interrupt AI while speaking. Now functional — 'speaking' state is properly set. */}
          <button
            onClick={call.interrupt}
            title="Прервать оператора"
            disabled={call.phase !== 'speaking'}
            className={[
              'w-[52px] h-[52px] rounded-full flex items-center justify-center ring-1 transition-all duration-200',
              call.phase === 'speaking'
                ? 'bg-white/[0.1] text-white/60 ring-white/15 hover:bg-white/[0.18] active:scale-95'
                : 'bg-white/[0.03] text-white/15 ring-white/5 cursor-not-allowed',
            ].join(' ')}>
            <InterruptIcon />
          </button>
        </div>
      )}

      {/* ── Footer ── */}
      {call.phase === 'ended' ? (
        <div className="shrink-0 pb-5 px-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl bg-blue-600/20 hover:bg-blue-600/30
              text-blue-300 text-[12px] font-semibold border border-blue-500/20
              transition-colors">
            Вернуться в чат
          </button>
        </div>
      ) : (
        <div className="shrink-0 pb-4 px-4">
          <p className="text-[9px] text-white/12 text-center">
            Разговор записывается · Только русский язык · Нажмите ❚❚ чтобы перебить оператора
          </p>
        </div>
      )}
    </div>
  );
}
