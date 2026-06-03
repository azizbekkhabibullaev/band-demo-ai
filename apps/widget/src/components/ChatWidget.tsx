import { useState, useEffect, useRef, useCallback } from 'react';
import type { WidgetConfigResponse } from '../types.ts';
import { createSession } from '../api/client.ts';
import { useChat } from '../hooks/useChat.ts';
import { WidgetButton } from './WidgetButton.tsx';
import { Header } from './Header.tsx';
import { MessageList } from './MessageList.tsx';
import { InputBar } from './InputBar.tsx';

interface Props {
  config: WidgetConfigResponse;
}

// ─── Demo sequence (CEO Demo Mode) ────────────────────────────────────────────
const DEMO_SEQUENCE: Record<string, Array<{ delay: number; text: string }>> = {
  ru: [
    { delay: 1200,  text: 'Подбери мне лучший вклад' },
    { delay: 9000,  text: 'Моя карта заблокирована, что делать?' },
    { delay: 18000, text: 'Перезвоните мне пожалуйста' },
  ],
  uz: [
    { delay: 1200,  text: 'Eng yaxshi depozitni tanlang' },
    { delay: 9000,  text: 'Kartam bloklandi, nima qilaman?' },
    { delay: 18000, text: 'Mutaxassis bilan bog\'lanmoqchiman' },
  ],
};

// ─── Typewriter hook ──────────────────────────────────────────────────────────
function useTypewriter(text: string, speed = 22, delayStart = 900) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const start = setTimeout(() => {
      const timer = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(timer);
          setDone(true);
        }
      }, speed);
      return () => clearInterval(timer);
    }, delayStart);
    return () => clearTimeout(start);
  }, [text, speed, delayStart]);

  return { displayed, done };
}

export function ChatWidget({ config }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [lang, setLang] = useState<string>(config.languages.default ?? 'ru');
  const greetingAdded = useRef(false);
  const demoRan = useRef(false);

  const { messages, isStreaming, addGreeting, sendMessage } = useChat(config.hotline);

  // Resolve greeting for current lang
  const greetingText = (config.greeting as Record<string, string>)[lang]
    ?? (config.greeting as Record<string, string>)[config.languages.default]
    ?? 'Welcome!';

  // Typewriter for greeting
  const { displayed: typewriterText, done: typewriterDone } = useTypewriter(greetingText, 22, 600);

  // Check demo mode from URL
  const isDemoMode = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('demo') === '1';

  // ── Open widget ──────────────────────────────────────────────────────────────
  const openWidget = useCallback(() => {
    setIsClosing(false);
    setIsOpen(true);
  }, []);

  // ── Close widget (with exit animation) ───────────────────────────────────────
  const closeWidget = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 160);
  }, []);

  // ── Session creation + greeting ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || sessionId || sessionError) return;
    let cancelled = false;

    createSession()
      .then(id => {
        if (cancelled) return;
        setSessionId(id);
        if (!greetingAdded.current) {
          greetingAdded.current = true;
          // Greeting will be shown via typewriter — don't addGreeting immediately
          // We add it as a real message after typewriter finishes
        }
      })
      .catch(() => {
        if (!cancelled) setSessionError(true);
      });

    return () => { cancelled = true; };
  }, [isOpen, sessionId, sessionError]);

  // ── Add greeting message after typewriter ────────────────────────────────────
  useEffect(() => {
    if (typewriterDone && sessionId && messages.length === 0) {
      addGreeting(greetingText);
    }
  }, [typewriterDone, sessionId, greetingText, addGreeting, messages.length]);

  // ── Demo mode: auto-open + run sequence ──────────────────────────────────────
  useEffect(() => {
    if (!isDemoMode || demoRan.current) return;
    openWidget();

    const seq = DEMO_SEQUENCE[lang] ?? DEMO_SEQUENCE['ru']!;
    seq.forEach(({ delay, text }) => {
      setTimeout(() => {
        setSessionId((prev: string | null) => {
          if (prev) void sendMessage(text, prev, lang);
          return prev;
        });
      }, delay + 2000); // +2s for widget open + greeting
    });

    demoRan.current = true;
  }, [isDemoMode, lang, openWidget, sendMessage]);

  async function handleSend(text: string) {
    if (!sessionId) return;
    await sendMessage(text, sessionId, lang);
  }

  function handleLangChange(newLang: string) {
    setLang(newLang);
  }

  const enabledLangs = (config.languages.enabled as string[]) ?? [config.languages.default];

  // ─── Error state ────────────────────────────────────────────────────────────
  const ErrorPanel = () => (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
        <span className="text-2xl">⚠️</span>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700 mb-1">Connection failed</p>
        <p className="text-xs text-slate-400">Could not start a chat session.</p>
      </div>
      <button
        onClick={() => { setSessionError(false); setSessionId(null); greetingAdded.current = false; }}
        className="px-5 py-2 rounded-full text-white text-sm font-semibold
          active:scale-95 transition-transform"
        style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}
      >
        Try again
      </button>
    </div>
  );

  return (
    <div className="fixed z-50
      max-sm:left-3 max-sm:right-3 max-sm:bottom-[calc(env(safe-area-inset-bottom,0px)+76px)]
      sm:bottom-6 sm:right-6
      flex flex-col items-end gap-3">

      {/* ── Chat panel ── */}
      {(isOpen || isClosing) && (
        <div className={isClosing ? 'widget-exit' : 'widget-enter'}>
          <div className="
            flex flex-col overflow-hidden bg-white rounded-widget shadow-widget
            ring-1 ring-slate-200/50
            max-sm:w-full
            sm:w-[400px]
            max-sm:h-[85svh]
            sm:h-[620px]
          ">
            <Header
              displayName={config.branding.displayName}
              lang={lang}
              enabledLangs={enabledLangs}
              onClose={closeWidget}
              onLangChange={handleLangChange}
            />

            {sessionError ? (
              <ErrorPanel />
            ) : (
              <>
                {/* Typewriter greeting overlay — shown before session ready */}
                {!sessionId && !sessionError && (
                  <div className="flex-1 flex flex-col items-start gap-2 px-4 pt-5 overflow-hidden">
                    <div className="flex gap-2 items-end">
                      <div className="w-7 h-7 rounded-full shrink-0 mb-0.5 flex items-center justify-center shadow-sm"
                        style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' }}>
                        <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                          <path d="M8 2L9.5 6.5H14L10.5 9L11.5 13.5L8 11L4.5 13.5L5.5 9L2 6.5H6.5L8 2Z"
                            fill="white" fillOpacity="0.92"/>
                        </svg>
                      </div>
                      <div className="bg-white ring-1 ring-slate-200/80 shadow-sm rounded-2xl rounded-bl-sm px-3.5 py-2.5 max-w-[85%]">
                        <p className="text-[13.5px] text-slate-800 leading-relaxed">
                          {typewriterText}
                          <span className="streaming-cursor" />
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Normal chat view */}
                {sessionId && (
                  <MessageList
                    messages={messages}
                    isStreaming={isStreaming}
                    lang={lang}
                    onQuickReply={handleSend}
                  />
                )}

                <InputBar
                  onSend={handleSend}
                  disabled={isStreaming || !sessionId}
                  lang={lang}
                />

                {/* Trust footer */}
                <div className="shrink-0 px-4 py-1.5 border-t border-slate-100 bg-slate-50/60
                  rounded-b-widget flex items-center justify-between gap-2">
                  <span className="text-[9.5px] text-slate-400 leading-tight">
                    🔒 Responses are informational. Consult a specialist for binding decisions.
                  </span>
                  <span className="text-[9px] text-slate-300 shrink-0 font-medium">AI</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── FAB button ── */}
      <WidgetButton isOpen={isOpen} onClick={isOpen ? closeWidget : openWidget} />
    </div>
  );
}
