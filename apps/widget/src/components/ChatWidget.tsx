import { useState, useEffect, useRef } from 'react';
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

export function ChatWidget({ config }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const greetingAdded = useRef(false);

  const { messages, isStreaming, addGreeting, sendMessage } = useChat(config.hotline);

  const defaultLang = config.languages.default;
  const greetingText = config.greeting[defaultLang];

  useEffect(() => {
    if (!isOpen || sessionId || sessionError) return;
    let cancelled = false;
    createSession()
      .then(id => {
        if (cancelled) return;
        setSessionId(id);
        if (!greetingAdded.current) {
          greetingAdded.current = true;
          addGreeting(greetingText);
        }
      })
      .catch(() => {
        if (!cancelled) setSessionError(true);
      });
    return () => { cancelled = true; };
  }, [isOpen, sessionId, sessionError, addGreeting, defaultLang, greetingText]);

  async function handleSend(text: string) {
    if (!sessionId) return;
    await sendMessage(text, sessionId);
  }

  return (
    <div className="fixed bottom-6 right-6 flex flex-col items-end gap-3 z-50">
      {isOpen && (
        <div className="transition-all duration-200 origin-bottom-right">
          {sessionError ? (
            <div className="w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <Header displayName={config.branding.displayName} onClose={() => setIsOpen(false)} />
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-gray-600">Could not start a chat session.</p>
                <button
                  onClick={() => { setSessionError(false); setSessionId(null); }}
                  className="px-4 py-2 rounded-full bg-[--accent-color] text-white text-sm hover:opacity-90"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <div className="w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <Header displayName={config.branding.displayName} onClose={() => setIsOpen(false)} />
              <MessageList messages={messages} isStreaming={isStreaming} />
              <InputBar onSend={handleSend} disabled={isStreaming || !sessionId} />
            </div>
          )}
        </div>
      )}
      <WidgetButton isOpen={isOpen} onClick={() => setIsOpen(o => !o)} />
    </div>
  );
}
