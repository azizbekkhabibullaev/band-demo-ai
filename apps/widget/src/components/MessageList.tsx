import { useEffect, useRef, useState, useCallback } from 'react';
import type { Message } from '../hooks/useChat.ts';
import { MessageBubble } from './MessageBubble.tsx';
import { TypingIndicator } from './TypingIndicator.tsx';

// ─── Quick-topic chips for empty state ───────────────────────────────────────
const TOPICS: Record<string, Array<{ icon: string; label: string; query: string }>> = {
  uz: [
    { icon: '💰', label: 'Eng yaxshi depozit',    query: 'Eng yaxshi depozitni tanlang' },
    { icon: '🏠', label: 'Kredit olish',           query: 'Kredit olish haqida ma\'lumot bering' },
    { icon: '💳', label: 'Karta rasmiylashtirish', query: 'Qanday karta rasmiylashtirish mumkin?' },
    { icon: '📱', label: 'Ilova muammosi',          query: 'Mobil ilovada muammo bor' },
    { icon: '🔒', label: 'Karta bloklangan',       query: 'Kartam bloklandi, nima qilaman?' },
    { icon: '📞', label: 'Mutaxassis',              query: 'Mutaxassis bilan bog\'lanmoqchiman' },
  ],
  ru: [
    { icon: '💰', label: 'Лучший вклад',           query: 'Подберите лучший вклад' },
    { icon: '🏠', label: 'Взять кредит',           query: 'Хочу взять кредит' },
    { icon: '💳', label: 'Оформить карту',         query: 'Как оформить карту?' },
    { icon: '📱', label: 'Проблема с приложением', query: 'Проблема с мобильным приложением' },
    { icon: '🔒', label: 'Карта заблокирована',    query: 'Моя карта заблокирована' },
    { icon: '📞', label: 'Специалист',             query: 'Хочу поговорить со специалистом' },
  ],
};

const WELCOME: Record<string, string> = {
  uz: 'Qanday yordam bera olaman?',
  ru: 'Чем могу помочь?',
};

const SUBTITLE: Record<string, string> = {
  uz: 'Mashhur mavzulardan birini tanlang yoki savolingizni yozing',
  ru: 'Выберите тему или напишите свой вопрос ниже',
};

const SCROLL_LABEL: Record<string, string> = {
  uz: '↓ Yangi xabar',
  ru: '↓ Новое сообщение',
};

interface Props {
  messages: Message[];
  isStreaming: boolean;
  lang?: string;
  onQuickReply?: (text: string) => void;
}

export function MessageList({ messages, isStreaming, lang = 'ru', onQuickReply }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Auto-scroll to bottom on new messages / streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 80);
  }, []);

  const lastMessage = messages[messages.length - 1];
  const showTyping = isStreaming && lastMessage?.role === 'assistant' && lastMessage.content === '';
  const topics = TOPICS[lang] ?? TOPICS['ru']!;

  // Show quick-action chips until user sends the first message.
  // The greeting (assistant message) does NOT count as "started" conversation.
  const hasUserMessages = messages.some(m => m.role === 'user');
  const showChips = !hasUserMessages && !isStreaming && !!onQuickReply;
  // Show full welcome header only before any messages exist
  const showWelcomeHeader = messages.length === 0;

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overflow-x-hidden px-3 py-3"
        style={{ background: 'linear-gradient(to bottom, #f8fafc 0%, #ffffff 60%)' }}
      >
        {/* ── Messages (always rendered) ── */}
        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onQuickReply={onQuickReply}
            isLast={idx === messages.length - 1}
            lang={lang}
          />
        ))}

        {showTyping && <TypingIndicator lang={lang} />}

        {/* ── Quick actions — stay visible until user sends first message ── */}
        {showChips && (
          <div className="flex flex-col items-center gap-3 pb-2 animate-in fade-in duration-300">
            {/* Welcome header — only shown before any messages */}
            {showWelcomeHeader && (
              <>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md mt-4"
                  style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' }}>
                  <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7">
                    <path d="M12 3L14 9H20L15 13L17 19L12 15L7 19L9 13L4 9H10L12 3Z"
                      fill="white" fillOpacity="0.95"/>
                  </svg>
                </div>
                <div className="text-center space-y-1 px-2">
                  <p className="text-[15px] font-semibold text-slate-800">
                    {WELCOME[lang] ?? WELCOME['ru']}
                  </p>
                  <p className="text-[12px] text-slate-500">
                    {SUBTITLE[lang] ?? SUBTITLE['ru']}
                  </p>
                </div>
              </>
            )}

            {/* Topic chips — 2-column grid */}
            <div className="grid grid-cols-2 gap-2 w-full">
              {topics.map(t => (
                <button
                  key={t.label}
                  onClick={() => onQuickReply(t.query)}
                  className="topic-chip flex items-center gap-2 px-3 py-2.5 rounded-xl
                    bg-white border border-slate-200 shadow-sm text-left
                    hover:border-blue-300 hover:bg-blue-50 transition-colors duration-150"
                >
                  <span className="text-base leading-none shrink-0">{t.icon}</span>
                  <span className="text-[12px] font-medium text-slate-700 leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-3 left-1/2 -translate-x-1/2
            bg-white border border-slate-200 shadow-md rounded-full
            px-3 py-1.5 text-[11px] text-slate-600 font-medium
            hover:bg-slate-50 transition-all flex items-center gap-1
            animate-in fade-in slide-in-from-bottom-1 duration-200"
        >
          {SCROLL_LABEL[lang] ?? SCROLL_LABEL['ru']}
        </button>
      )}
    </div>
  );
}
