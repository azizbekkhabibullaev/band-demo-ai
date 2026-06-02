import { useEffect, useRef } from 'react';
import type { Message } from '../hooks/useChat.ts';
import { MessageBubble } from './MessageBubble.tsx';
import { TypingIndicator } from './TypingIndicator.tsx';

interface Props {
  messages: Message[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const lastMessage = messages[messages.length - 1];
  const showTyping = isStreaming && lastMessage?.role === 'assistant' && lastMessage.content === '';

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      {messages.length === 0 && !isStreaming && (
        <div className="flex items-center justify-center h-full opacity-40">
          <p className="text-sm text-gray-500">Start a conversation below.</p>
        </div>
      )}
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {showTyping && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
