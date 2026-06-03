import { useState, useCallback, useRef } from 'react';
import type { ChatSseEvent } from '../types.ts';
import { streamChat } from '../api/client.ts';
import { getQuickActions, type QuickAction } from '../utils/quickActions.ts';

// Extend done event type to include meta (present in server response)
type DoneEvent = Extract<ChatSseEvent, { type: 'done' }> & {
  meta?: { routing_tier?: string; confidence?: number; lang?: string; intent?: string };
};

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  escalation?: boolean;
  routingTier?: string;
  confidence?: number;
  intent?: string;
  suggestedReplies?: string[];  // kept for backward compat (labels only)
  quickActions?: QuickAction[];  // full action objects with label + query
}

export interface UseChatReturn {
  messages: Message[];
  isStreaming: boolean;
  addGreeting: (text: string) => void;
  sendMessage: (text: string, sessionId: string, lang?: string) => Promise<void>;
  clearMessages: () => void;
}

// Quick actions are now computed by QuickActionEngine (utils/quickActions.ts)
// using intent + confidence from the SSE done event meta.

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
            const resolvedLang = event.meta?.lang ?? lang;
            // Get last user message for purchase intent detection
            const lastUserText = [...prev].reverse().find(m => m.role === 'user')?.content ?? '';
            // QuickActionEngine: context-aware chips, confidence-gated
            const quickActions = event.escalation ? [] : getQuickActions(
              event.meta?.intent,
              event.meta?.confidence,
              resolvedLang,
              lastUserText,
            );

            const updated = prev.map((m: Message) =>
              m.id === assistantId
                ? {
                    ...m,
                    streaming: false,
                    escalation: event.escalation,
                    routingTier: event.meta?.routing_tier,
                    confidence: event.meta?.confidence,
                    intent: event.meta?.intent,
                    suggestedReplies: quickActions.map(a => a.label),
                    quickActions,
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
