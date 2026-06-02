import { useState, useCallback, useRef } from 'react';
import type { ChatSseEvent } from '../types.ts';
import { streamChat } from '../api/client.ts';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  escalation?: boolean;
}

export interface UseChatReturn {
  messages: Message[];
  isStreaming: boolean;
  addGreeting: (text: string) => void;
  sendMessage: (text: string, sessionId: string) => Promise<void>;
  clearMessages: () => void;
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

  const sendMessage = useCallback(async (text: string, sessionId: string) => {
    if (isStreamingRef.current) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    isStreamingRef.current = true;
    setIsStreaming(true);

    const assistantId = assistantMsg.id;

    try {
      await streamChat(sessionId, text, {
        onDelta(deltaText) {
          setMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content: m.content + deltaText } : m),
          );
        },
        onDone(event: Extract<ChatSseEvent, { type: 'done' }>) {
          setMessages(prev => {
            const updated = prev.map(m =>
              m.id === assistantId ? { ...m, streaming: false, escalation: event.escalation } : m,
            );
            if (event.escalation) {
              const sysMsg: Message = {
                id: crypto.randomUUID(),
                role: 'system',
                content: `To speak with a specialist, call our hotline: ${hotline}`,
              };
              return [...updated, sysMsg];
            }
            return updated;
          });
          isStreamingRef.current = false;
          setIsStreaming(false);
        },
        onError(event: Extract<ChatSseEvent, { type: 'error' }>) {
          setMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content: event.fallback, streaming: false } : m),
          );
          isStreamingRef.current = false;
          setIsStreaming(false);
        },
      });
    } finally {
      isStreamingRef.current = false;
      setIsStreaming(false);
    }
  }, [hotline]);

  return { messages, isStreaming, addGreeting, sendMessage, clearMessages };
}
