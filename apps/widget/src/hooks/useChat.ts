import { useState, useCallback, useRef } from 'react';
import type { ChatSseEvent } from '../types.ts';
import { streamChat } from '../api/client.ts';

// Extend done event type to include meta (present in server response)
type DoneEvent = Extract<ChatSseEvent, { type: 'done' }> & {
  meta?: { routing_tier?: string; confidence?: number; lang?: string };
};

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  escalation?: boolean;
  routingTier?: string;
  confidence?: number;
  suggestedReplies?: string[];
}

export interface UseChatReturn {
  messages: Message[];
  isStreaming: boolean;
  addGreeting: (text: string) => void;
  sendMessage: (text: string, sessionId: string, lang?: string) => Promise<void>;
  clearMessages: () => void;
}

// ─── Suggested replies per topic ─────────────────────────────────────────────
const SUGGESTED_REPLIES: Record<string, Record<string, string[]>> = {
  deposit: {
    uz: ['💰 Minimal summa?', '📅 Muddatdan oldin?', '✅ Qanday hujjatlar?'],
    ru: ['💰 Минимальная сумма?', '📅 Досрочное снятие?', '✅ Нужные документы?'],
  },
  loan: {
    uz: ['📋 Hujjatlar ro\'yxati?', '📊 Oylik to\'lov?', '⚡ Tez ko\'rib chiqish?'],
    ru: ['📋 Список документов?', '📊 Ежемесячный платёж?', '⚡ Срочное рассмотрение?'],
  },
  card: {
    uz: ['💳 Karta turlari?', '🌍 Xorijda ishlatish?', '✅ Qanday rasmiylashtirish?'],
    ru: ['💳 Виды карт?', '🌍 Использование за рубежом?', '✅ Как оформить?'],
  },
  callback: {
    uz: ['📞 Qachon qo\'ng\'iroq qilasiz?', '⏰ Qulay vaqt?'],
    ru: ['📞 Когда позвонят?', '⏰ Удобное время?'],
  },
};

function inferSuggestedReplies(text: string, lang: string): string[] {
  const t = text.toLowerCase();
  const l = lang === 'uz' ? 'uz' : 'ru';
  if (/depozit|вклад|omonat|daromax|накоп|jamg'/i.test(t))
    return SUGGESTED_REPLIES['deposit']?.[l] ?? [];
  if (/kredit|кредит|ipoteka|ипотек|avtokredit|автокред/i.test(t))
    return SUGGESTED_REPLIES['loan']?.[l] ?? [];
  if (/karta|карт|uzcard|visa/i.test(t))
    return SUGGESTED_REPLIES['card']?.[l] ?? [];
  if (/qo'ng'iroq|перезвон|callback|zvon/i.test(t))
    return SUGGESTED_REPLIES['callback']?.[l] ?? [];
  return [];
}

export function useChat(hotline: string): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);

  const addGreeting = useCallback((text: string) => {
    setMessages([{ id: crypto.randomUUID(), role: 'assistant', content: text }]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const sendMessage = useCallback(async (text: string, sessionId: string, lang = 'ru') => {
    if (isStreamingRef.current) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', streaming: true };

    setMessages((prev: Message[]) => [...prev, userMsg, assistantMsg]);
    isStreamingRef.current = true;
    setIsStreaming(true);

    const assistantId = assistantMsg.id;

    try {
      await streamChat(sessionId, text, {
        onDelta(deltaText) {
          setMessages((prev: Message[]) =>
            prev.map((m: Message) => m.id === assistantId ? { ...m, content: m.content + deltaText } : m),
          );
        },
        onDone(rawEvent) {
          const event = rawEvent as DoneEvent;
          setMessages((prev: Message[]) => {
            const fullText = prev.find((m: Message) => m.id === assistantId)?.content ?? '';
            const resolvedLang = event.meta?.lang ?? lang;
            const suggestions = inferSuggestedReplies(fullText, resolvedLang);

            const updated = prev.map((m: Message) =>
              m.id === assistantId
                ? {
                    ...m,
                    streaming: false,
                    escalation: event.escalation,
                    routingTier: event.meta?.routing_tier,
                    confidence: event.meta?.confidence,
                    suggestedReplies: event.escalation ? [] : suggestions,
                  }
                : m,
            );

            if (event.escalation) {
              const sysMsg: Message = {
                id: crypto.randomUUID(),
                role: 'system',
                content: hotline,
              };
              return [...updated, sysMsg];
            }
            return updated;
          });
          isStreamingRef.current = false;
          setIsStreaming(false);
        },
        onError(event) {
          setMessages((prev: Message[]) =>
            prev.map((m: Message) => m.id === assistantId ? { ...m, content: event.fallback, streaming: false } : m),
          );
          isStreamingRef.current = false;
          setIsStreaming(false);
        },
      }, lang);
    } finally {
      isStreamingRef.current = false;
      setIsStreaming(false);
    }
  }, [hotline]);

  return { messages, isStreaming, addGreeting, sendMessage, clearMessages };
}
