import { useState, useEffect, useRef, useCallback } from 'react';
import type { WidgetConfigResponse } from '../types.ts';
import { createSession, submitLead } from '../api/client.ts';
import { useChat } from '../hooks/useChat.ts';
import { WidgetButton } from './WidgetButton.tsx';
import { Header } from './Header.tsx';
import { MessageList } from './MessageList.tsx';
import { InputBar } from './InputBar.tsx';

interface Props {
  config: WidgetConfigResponse;
}

// ─── Trust footer copy ────────────────────────────────────────────────────────
const TRUST_FOOTER: Record<string, string> = {
  uz: "🔒 Javoblar ma'lumot uchun. Rasmiy qarorlar uchun mutaxassisga murojaat qiling.",
  ru: '🔒 Ответы носят информационный характер. За официальными решениями обратитесь к специалисту.',
};

// ─── Banking interest detection ───────────────────────────────────────────────
const INTEREST_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /ипотек|ipoteka/i,                         label: 'Ипотека' },
  { re: /автокред|avtokredit/i,                    label: 'Автокредит' },
  { re: /кредит|kredit/i,                          label: 'Кредит' },
  { re: /вклад|депозит|depozit|omonat/i,           label: 'Депозит/Вклад' },
  { re: /карт|karta/i,                             label: 'Карта' },
  { re: /инвестиц|investits|brokersk|брокер/i,     label: 'Инвестиции' },
  { re: /перевод|o.tkazm/i,                        label: 'Перевод' },
  { re: /рассрочк|bo.lib to.l/i,                   label: 'Рассрочка' },
];

function detectInterest(userText: string): string | null {
  for (const { re, label } of INTEREST_PATTERNS) {
    if (re.test(userText)) return label;
  }
  return null;
}

// ─── Phone validation (UZ: +998XXXXXXXXX) ────────────────────────────────────
const UZ_PHONE_RE = /^\+998[0-9]{9}$/;

function formatPhone(raw: string): string {
  // Strip everything except digits and leading +
  let val = raw.replace(/[^\d+]/g, '');
  if (val.startsWith('998') && !val.startsWith('+')) val = '+' + val;
  if (!val.startsWith('+')) val = '+998' + val.replace(/^0+/, '');
  return val;
}

// ─── Lead capture card ────────────────────────────────────────────────────────
interface LeadCardProps {
  lang: string;
  interestType: string;
  sessionId: string | null;
  onDismiss: () => void;
  onSubmitted: () => void;
}

function LeadCaptureCard({ lang, interestType, sessionId, onDismiss, onSubmitted }: LeadCardProps) {
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [phoneErr, setPhoneErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]         = useState(false);

  const isUz = lang === 'uz';

  const labels = {
    headline: isUz
      ? 'Mutaxassis siz bilan bog\'lansinmi?'
      : 'Хотите, чтобы специалист связался с Вами?',
    sub: isUz
      ? `Mahsulot: ${interestType}`
      : `Продукт: ${interestType}`,
    namePlaceholder: isUz ? 'Ismingiz (ixtiyoriy)' : 'Ваше имя (необязательно)',
    phonePlaceholder: '+998 XX XXX XX XX',
    phoneLabel: isUz ? 'Telefon raqam *' : 'Номер телефона *',
    phoneError: isUz ? 'Raqam noto\'g\'ri. Misol: +998901234567' : 'Неверный формат. Пример: +998901234567',
    submit: isUz ? 'Murojaat yuborish' : 'Оставить заявку',
    dismiss: isUz ? 'Keyinroq' : 'Позже',
    successTitle: isUz ? '✅ Muvaffaqiyatli!' : '✅ Заявка принята!',
    successText: isUz
      ? 'Mutaxassisimiz tez orada siz bilan bog\'lanadi.'
      : 'Наш специалист свяжется с вами в ближайшее время.',
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formatted = formatPhone(phone);
    if (!UZ_PHONE_RE.test(formatted)) {
      setPhoneErr(labels.phoneError);
      return;
    }
    setPhoneErr('');
    setSubmitting(true);
    try {
      await submitLead({
        phone: formatted,
        fullName: name.trim() || undefined,
        interestType,
        sessionId: sessionId ?? undefined,
        lang,
      });
      setDone(true);
      setTimeout(() => onSubmitted(), 2500);
    } catch {
      // silently ignore — lead capture is best-effort
      setDone(true);
      setTimeout(() => onSubmitted(), 2500);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-3 mb-2 px-4 py-3.5 rounded-2xl border border-emerald-200 bg-emerald-50 text-center animate-in fade-in duration-300">
        <p className="text-[13px] font-semibold text-emerald-700">{labels.successTitle}</p>
        <p className="text-[11.5px] text-emerald-600 mt-0.5">{labels.successText}</p>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="px-4 pt-3.5 pb-1">
        <p className="text-[13px] font-semibold text-slate-800 leading-snug">{labels.headline}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{labels.sub}</p>
      </div>
      <form onSubmit={handleSubmit} className="px-4 pb-3.5 pt-2 space-y-2">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={labels.namePlaceholder}
          className="w-full px-3 py-2 rounded-xl text-[12.5px] border border-slate-200
            bg-white text-slate-800 placeholder-slate-400 outline-none
            focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
        />
        <div>
          <input
            type="tel"
            value={phone}
            onChange={e => { setPhone(e.target.value); setPhoneErr(''); }}
            placeholder={labels.phonePlaceholder}
            className={[
              'w-full px-3 py-2 rounded-xl text-[12.5px] border bg-white text-slate-800',
              'placeholder-slate-400 outline-none transition-all',
              phoneErr ? 'border-red-400 focus:ring-2 focus:ring-red-100' : 'border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100',
            ].join(' ')}
            required
          />
          {phoneErr && <p className="text-[10.5px] text-red-500 mt-1 ml-1">{phoneErr}</p>}
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={submitting}
            className="flex-1 py-2 rounded-xl text-white text-[12px] font-semibold
              disabled:opacity-50 transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' }}>
            {submitting ? '…' : labels.submit}
          </button>
          <button type="button" onClick={onDismiss}
            className="px-4 py-2 rounded-xl text-[12px] text-slate-500 border border-slate-200
              hover:bg-slate-50 transition-colors">
            {labels.dismiss}
          </button>
        </div>
      </form>
    </div>
  );
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
  const [isOpen, setIsOpen]       = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [lang, setLang] = useState<string>(config.languages.default ?? 'ru');
  const [leadInterest, setLeadInterest] = useState<string | null>(null);
  const [leadDismissed, setLeadDismissed] = useState(false);
  const [leadSubmitted, setLeadSubmitted] = useState(false);
  const greetingAdded = useRef(false);
  const demoRan       = useRef(false);

  const { messages, isStreaming, addGreeting, sendMessage, clearMessages } = useChat(config.hotline);

  // Greeting for current language
  const greetingText = (config.greeting as Record<string, string>)[lang]
    ?? (config.greeting as Record<string, string>)[config.languages.default]
    ?? 'Welcome!';

  // Typewriter (shown before session is ready)
  const { displayed: typewriterText, done: typewriterDone } = useTypewriter(greetingText, 22, 600);

  const isDemoMode = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('demo') === '1';

  // ── Open / close ─────────────────────────────────────────────────────────────
  const openWidget = useCallback(() => {
    setIsClosing(false);
    setIsOpen(true);
  }, []);

  const closeWidget = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 160);
  }, []);

  // ── Session creation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || sessionId || sessionError) return;
    let cancelled = false;
    createSession()
      .then(id => { if (!cancelled) setSessionId(id); })
      .catch(() => { if (!cancelled) setSessionError(true); });
    return () => { cancelled = true; };
  }, [isOpen, sessionId, sessionError]);

  // ── Add greeting after typewriter finishes ───────────────────────────────────
  useEffect(() => {
    if (typewriterDone && sessionId && messages.length === 0) {
      addGreeting(greetingText);
    }
  }, [typewriterDone, sessionId, greetingText, addGreeting, messages.length]);

  // ── Detect banking interest to trigger lead capture ───────────────────────────
  useEffect(() => {
    if (leadInterest || leadDismissed || leadSubmitted) return;
    const userText = messages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join(' ');
    if (!userText) return;
    const interest = detectInterest(userText);
    if (interest) setLeadInterest(interest);
  }, [messages, leadInterest, leadDismissed, leadSubmitted]);

  // ── Language change: reset greeting if conversation hasn't started ────────────
  function handleLangChange(newLang: string) {
    const hasUserMessages = messages.some(m => m.role === 'user');
    setLang(newLang);
    if (!hasUserMessages && sessionId) {
      const newGreeting = (config.greeting as Record<string, string>)[newLang]
        ?? (config.greeting as Record<string, string>)[config.languages.default]
        ?? '';
      // addGreeting replaces all messages with just the greeting
      if (newGreeting) addGreeting(newGreeting);
      else clearMessages();
    }
  }

  // ── Demo mode ────────────────────────────────────────────────────────────────
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
      }, delay + 2000);
    });
    demoRan.current = true;
  }, [isDemoMode, lang, openWidget, sendMessage]);

  async function handleSend(text: string) {
    if (!sessionId) return;
    await sendMessage(text, sessionId, lang);
  }

  const enabledLangs = (config.languages.enabled as string[]) ?? [config.languages.default];

  // ── Error state ──────────────────────────────────────────────────────────────
  const ErrorPanel = () => (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
        <span className="text-2xl">⚠️</span>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700 mb-1">
          {lang === 'uz' ? 'Ulanish xatosi' : 'Ошибка подключения'}
        </p>
        <p className="text-xs text-slate-400">
          {lang === 'uz' ? 'Chat sessiyasini boshlashda xato.' : 'Не удалось начать чат-сессию.'}
        </p>
      </div>
      <button
        onClick={() => { setSessionError(false); setSessionId(null); greetingAdded.current = false; }}
        className="px-5 py-2 rounded-full text-white text-sm font-semibold active:scale-95 transition-transform"
        style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}
      >
        {lang === 'uz' ? 'Qayta urinish' : 'Попробовать снова'}
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
                {/* Typewriter overlay — shown before session is ready */}
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
                    sessionId={sessionId}
                    onQuickReply={handleSend}
                  />
                )}

                {/* Lead capture card — shown after banking interest detected */}
                {sessionId && leadInterest && !leadDismissed && !leadSubmitted && !isStreaming && (
                  <LeadCaptureCard
                    lang={lang}
                    interestType={leadInterest}
                    sessionId={sessionId}
                    onDismiss={() => setLeadDismissed(true)}
                    onSubmitted={() => setLeadSubmitted(true)}
                  />
                )}

                <InputBar
                  onSend={handleSend}
                  disabled={isStreaming || !sessionId}
                  lang={lang}
                />

                {/* Trust footer — localized, no AI jargon */}
                <div className="shrink-0 px-4 py-1.5 border-t border-slate-100 bg-slate-50/60
                  rounded-b-widget">
                  <span className="block text-[9.5px] text-slate-400 leading-tight text-center">
                    {TRUST_FOOTER[lang] ?? TRUST_FOOTER['ru']}
                  </span>
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
