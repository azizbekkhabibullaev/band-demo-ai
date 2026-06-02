# Chat Widget Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a floating React chat widget in `apps/widget` that embeds in a mock bank demo page and streams responses from the existing Fastify SSE API in real time.

**Architecture:** `apps/widget` is a new Vite + React 18 + TypeScript + Tailwind CSS workspace in the monorepo. It runs on port 5173 with Vite's `server.proxy` forwarding `/api/*` to `http://localhost:3000` with an origin rewrite. Types are imported from `@bank-chatbot/shared` (whose `"main"` points to `./src/index.ts` — Vite handles `.ts` imports directly).

**Tech Stack:** React 18, Vite 5, TypeScript, Tailwind CSS 3, PostCSS, `@vitejs/plugin-react`

---

## File Structure

```
apps/widget/
  src/
    main.tsx
    App.tsx
    index.css
    types.ts
    api/
      client.ts
    hooks/
      useWidgetConfig.ts
      useChat.ts
    components/
      ChatWidget.tsx
      WidgetButton.tsx
      ChatPanel.tsx
      Header.tsx
      MessageList.tsx
      MessageBubble.tsx
      TypingIndicator.tsx
      InputBar.tsx
  index.html
  vite.config.ts
  tsconfig.json
  package.json
  tailwind.config.js
  postcss.config.js
```

---

### Task 1: Scaffold `apps/widget` — config files + entry points

**Files:**
- Create: `apps/widget/package.json`
- Create: `apps/widget/tsconfig.json`
- Create: `apps/widget/vite.config.ts`
- Create: `apps/widget/tailwind.config.js`
- Create: `apps/widget/postcss.config.js`
- Create: `apps/widget/index.html`
- Create: `apps/widget/src/index.css`
- Create: `apps/widget/src/main.tsx`
- Modify: `package.json` (root) — add `dev:widget` and `build:widget` scripts

- [ ] **Step 1: Create `apps/widget/package.json`**

```json
{
  "name": "@bank-chatbot/widget",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@bank-chatbot/shared": "*",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^5.4.11"
  }
}
```

- [ ] **Step 2: Create `apps/widget/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/widget/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        headers: { origin: 'http://localhost:3000' },
      },
    },
  },
});
```

- [ ] **Step 4: Create `apps/widget/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 5: Create `apps/widget/postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create `apps/widget/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bank Demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `apps/widget/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create `apps/widget/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 9: Add scripts to root `package.json`**

Open `package.json` at the repo root. Add these two scripts alongside the existing ones:

```json
"dev:widget": "npm run -w apps/widget dev",
"build:widget": "npm run -w apps/widget build"
```

- [ ] **Step 10: Install dependencies**

```bash
cd /path/to/bank-chatbot && npm install
```

Expected: No errors. `apps/widget/node_modules` populated.

- [ ] **Step 11: Verify typecheck passes**

```bash
npm run -w apps/widget typecheck
```

Expected: 0 errors (only `main.tsx` and empty `App.tsx` stub needed — create a temporary stub `src/App.tsx` with `export default function App() { return null; }` if needed).

- [ ] **Step 12: Commit**

```bash
git add apps/widget package.json package-lock.json
git commit -m "feat(widget): scaffold apps/widget — Vite + React + Tailwind"
```

---

### Task 2: API client (`src/types.ts` + `src/api/client.ts`)

**Files:**
- Create: `apps/widget/src/types.ts`
- Create: `apps/widget/src/api/client.ts`

- [ ] **Step 1: Create `apps/widget/src/types.ts`**

```ts
export type {
  Lang,
  WidgetConfigResponse,
  SessionNewResponse,
  ChatSseEvent,
} from '@bank-chatbot/shared';
```

- [ ] **Step 2: Create `apps/widget/src/api/client.ts`**

```ts
import type { WidgetConfigResponse, ChatSseEvent } from '../types.ts';

const TENANT_ID = 'demo-bank';

export async function fetchWidgetConfig(): Promise<WidgetConfigResponse> {
  const res = await fetch(`/api/widget-config/${TENANT_ID}`);
  if (!res.ok) throw new Error(`widget-config ${res.status}`);
  return res.json() as Promise<WidgetConfigResponse>;
}

export async function createSession(): Promise<string> {
  const res = await fetch('/api/session/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID }),
  });
  if (!res.ok) throw new Error(`session/new ${res.status}`);
  const data = (await res.json()) as { session_id: string };
  return data.session_id;
}

export async function streamChat(
  sessionId: string,
  message: string,
  callbacks: {
    onDelta: (text: string) => void;
    onDone: (event: Extract<ChatSseEvent, { type: 'done' }>) => void;
    onError: (event: Extract<ChatSseEvent, { type: 'error' }>) => void;
  },
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, session_id: sessionId, message }),
  });
  if (!res.ok || !res.body) {
    callbacks.onError({ type: 'error', error: `HTTP ${res.status}`, fallback: 'Something went wrong. Please try again.' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        const event = JSON.parse(json) as ChatSseEvent;
        if (event.type === 'delta') callbacks.onDelta(event.text);
        else if (event.type === 'done') callbacks.onDone(event);
        else if (event.type === 'error') callbacks.onError(event);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run -w apps/widget typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/widget/src/types.ts apps/widget/src/api/client.ts
git commit -m "feat(widget): add API client — fetchWidgetConfig, createSession, streamChat"
```

---

### Task 3: Hooks (`useWidgetConfig` + `useChat`)

**Files:**
- Create: `apps/widget/src/hooks/useWidgetConfig.ts`
- Create: `apps/widget/src/hooks/useChat.ts`

- [ ] **Step 1: Create `apps/widget/src/hooks/useWidgetConfig.ts`**

```ts
import { useState, useEffect } from 'react';
import type { WidgetConfigResponse } from '../types.ts';
import { fetchWidgetConfig } from '../api/client.ts';

type State =
  | { status: 'loading' }
  | { status: 'ok'; config: WidgetConfigResponse }
  | { status: 'error' };

export function useWidgetConfig(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchWidgetConfig()
      .then(config => { if (!cancelled) setState({ status: 'ok', config }); })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, []);

  return state;
}
```

- [ ] **Step 2: Create `apps/widget/src/hooks/useChat.ts`**

```ts
import { useState, useCallback } from 'react';
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

  const addGreeting = useCallback((text: string) => {
    setMessages([{ id: crypto.randomUUID(), role: 'assistant', content: text }]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const sendMessage = useCallback(async (text: string, sessionId: string) => {
    if (isStreaming) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const assistantId = assistantMsg.id;

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
        setIsStreaming(false);
      },
      onError(event: Extract<ChatSseEvent, { type: 'error' }>) {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: event.fallback, streaming: false } : m),
        );
        setIsStreaming(false);
      },
    });
  }, [isStreaming, hotline]);

  return { messages, isStreaming, addGreeting, sendMessage, clearMessages };
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run -w apps/widget typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/widget/src/hooks/
git commit -m "feat(widget): add useWidgetConfig and useChat hooks"
```

---

### Task 4: Primitive components (`MessageBubble`, `TypingIndicator`, `InputBar`, `MessageList`)

**Files:**
- Create: `apps/widget/src/components/MessageBubble.tsx`
- Create: `apps/widget/src/components/TypingIndicator.tsx`
- Create: `apps/widget/src/components/InputBar.tsx`
- Create: `apps/widget/src/components/MessageList.tsx`

- [ ] **Step 1: Create `apps/widget/src/components/MessageBubble.tsx`**

```tsx
import type { Message } from '../hooks/useChat.ts';

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-3 py-1 text-center max-w-[85%]">
          {message.content}
        </span>
      </div>
    );
  }

  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed break-words ${
          isUser
            ? 'bg-[--accent-color] text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/widget/src/components/TypingIndicator.tsx`**

```tsx
export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-2">
      <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 flex gap-1 items-center">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/widget/src/components/InputBar.tsx`**

```tsx
import { useRef, useState, type KeyboardEvent } from 'react';

const MAX_CHARS = 2000;
const COUNTER_THRESHOLD = 200;

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function InputBar({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charsLeft = MAX_CHARS - value.length;
  const canSend = !disabled && value.trim().length > 0 && value.length <= MAX_CHARS;

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 24;
    const maxHeight = lineHeight * 4;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }

  return (
    <div className="border-t border-gray-200 p-3 bg-white rounded-b-2xl">
      {charsLeft <= COUNTER_THRESHOLD && (
        <div className={`text-xs text-right mb-1 ${charsLeft < 0 ? 'text-red-500' : 'text-gray-400'}`}>
          {charsLeft}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:opacity-50 leading-6 min-h-[36px] max-h-[96px]"
        />
        <button
          onClick={submit}
          disabled={!canSend}
          className="shrink-0 w-9 h-9 rounded-full bg-[--accent-color] text-white flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
          aria-label="Send"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3.105 2.288a.75.75 0 00-.826.95l1.903 6.115a.75.75 0 00.608.509L11.5 10.5l-6.71.638a.75.75 0 00-.608.509L2.28 17.762a.75.75 0 00.826.95l15.5-7.5a.75.75 0 000-1.424l-15.5-7.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/widget/src/components/MessageList.tsx`**

```tsx
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
      {messages.map(msg => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {showTyping && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run -w apps/widget typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/widget/src/components/MessageBubble.tsx apps/widget/src/components/TypingIndicator.tsx apps/widget/src/components/InputBar.tsx apps/widget/src/components/MessageList.tsx
git commit -m "feat(widget): add MessageBubble, TypingIndicator, InputBar, MessageList"
```

---

### Task 5: Shell components (`Header`, `WidgetButton`, `ChatPanel`, `ChatWidget`)

**Files:**
- Create: `apps/widget/src/components/Header.tsx`
- Create: `apps/widget/src/components/WidgetButton.tsx`
- Create: `apps/widget/src/components/ChatPanel.tsx`
- Create: `apps/widget/src/components/ChatWidget.tsx`

- [ ] **Step 1: Create `apps/widget/src/components/Header.tsx`**

```tsx
interface Props {
  displayName: string;
  onClose: () => void;
}

export function Header({ displayName, onClose }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[--accent-color] text-white rounded-t-2xl">
      <span className="font-semibold text-sm truncate">{displayName}</span>
      <button
        onClick={onClose}
        aria-label="Close chat"
        className="hover:opacity-75 transition-opacity ml-2 shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/widget/src/components/WidgetButton.tsx`**

```tsx
interface Props {
  isOpen: boolean;
  onClick: () => void;
}

export function WidgetButton({ isOpen, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      aria-label={isOpen ? 'Close chat' : 'Open chat'}
      className="w-14 h-14 rounded-full bg-[--accent-color] text-white shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
    >
      {isOpen ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
          <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H6l-4 4V5z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Create `apps/widget/src/components/ChatPanel.tsx`**

```tsx
import { useState } from 'react';
import type { WidgetConfigResponse } from '../types.ts';
import { useChat } from '../hooks/useChat.ts';
import { Header } from './Header.tsx';
import { MessageList } from './MessageList.tsx';
import { InputBar } from './InputBar.tsx';

interface Props {
  config: WidgetConfigResponse;
  sessionId: string | null;
  onSessionError: () => void;
  onClose: () => void;
}

export function ChatPanel({ config, sessionId, onSessionError: _onSessionError, onClose }: Props) {
  const { messages, isStreaming, sendMessage } = useChat(config.hotline);
  const [sessionError] = useState(false);

  async function handleSend(text: string) {
    if (!sessionId) return;
    await sendMessage(text, sessionId);
  }

  if (sessionError) {
    return (
      <div className="w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <Header displayName={config.branding.displayName} onClose={onClose} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-gray-600">Could not start a chat session.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-full bg-[--accent-color] text-white text-sm hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <Header displayName={config.branding.displayName} onClose={onClose} />
      <MessageList messages={messages} isStreaming={isStreaming} />
      <InputBar onSend={handleSend} disabled={isStreaming || !sessionId} />
    </div>
  );
}
```

- [ ] **Step 4: Create `apps/widget/src/components/ChatWidget.tsx`**

```tsx
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

  useEffect(() => {
    if (!isOpen || sessionId || sessionError) return;
    createSession()
      .then(id => {
        setSessionId(id);
        if (!greetingAdded.current) {
          greetingAdded.current = true;
          const defaultLang = config.languages.default;
          addGreeting(config.greeting[defaultLang]);
        }
      })
      .catch(() => setSessionError(true));
  }, [isOpen, sessionId, sessionError, config, addGreeting]);

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
```

- [ ] **Step 5: Verify typecheck**

```bash
npm run -w apps/widget typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add apps/widget/src/components/Header.tsx apps/widget/src/components/WidgetButton.tsx apps/widget/src/components/ChatPanel.tsx apps/widget/src/components/ChatWidget.tsx
git commit -m "feat(widget): add Header, WidgetButton, ChatPanel, ChatWidget"
```

---

### Task 6: `App.tsx` with DemoPage — final integration

**Files:**
- Create: `apps/widget/src/App.tsx` (replace stub)

- [ ] **Step 1: Create `apps/widget/src/App.tsx`**

```tsx
import { useEffect } from 'react';
import { useWidgetConfig } from './hooks/useWidgetConfig.ts';
import { ChatWidget } from './components/ChatWidget.tsx';

function DemoPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[--accent-color]" />
        <span className="font-semibold text-gray-900">Demo Bank</span>
      </nav>
      <main className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to Demo Bank
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Fast, secure banking for everyone. Loans, cards, deposits and more.
        </p>
        <div className="flex gap-4 justify-center">
          <button className="px-6 py-3 rounded-full bg-[--accent-color] text-white font-medium hover:opacity-90 transition-opacity">
            Get Started
          </button>
          <button className="px-6 py-3 rounded-full border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
            Learn More
          </button>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const state = useWidgetConfig();

  useEffect(() => {
    if (state.status === 'ok') {
      document.documentElement.style.setProperty(
        '--accent-color',
        state.config.branding.accentColor,
      );
    }
  }, [state]);

  return (
    <>
      <DemoPage />
      {state.status === 'ok' && <ChatWidget config={state.config} />}
    </>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run -w apps/widget typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Start backend (in a separate terminal) and run the widget dev server**

In terminal 1:
```bash
cd /path/to/bank-chatbot && npm run dev
```

In terminal 2:
```bash
npm run dev:widget
```

Expected: Vite starts on `http://localhost:5173`. Open browser, see mock bank page with chat FAB in bottom-right.

- [ ] **Step 4: Manual smoke test**

1. Open `http://localhost:5173` in a browser.
2. Verify the accent color is applied (FAB and header should be the bank's brand color).
3. Click the FAB — panel opens, greeting message appears.
4. Type "What loans do you offer?" — user bubble appears, assistant streams a response.
5. Verify streaming: content grows in real time before the final message settles.
6. Close and reopen — same session, same messages retained.

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/App.tsx
git commit -m "feat(widget): add App.tsx with DemoPage + ChatWidget integration"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Floating FAB (bottom-right) | T5 `WidgetButton`, `ChatWidget` |
| Panel 380×520px, anchored above button | T5 `ChatWidget` |
| `useWidgetConfig` fetch once on mount | T3 |
| `createSession` on first open + greeting bubble | T5 `ChatWidget` |
| `streamChat` with line-buffering SSE reader | T2 `client.ts` |
| `delta` events grow assistant bubble | T3 `useChat.ts` |
| `done` event: finalize bubble + optional system escalation | T3 `useChat.ts` |
| `error` event: replace bubble with fallback | T3 `useChat.ts` |
| `--accent-color` applied from config | T6 `App.tsx` |
| `bg-[--accent-color]` in components | T4, T5 |
| `TypingIndicator` while streaming + empty last message | T4 `MessageList.tsx` |
| Auto-scroll to bottom on new messages | T4 `MessageList.tsx` |
| Textarea auto-resize up to 4 rows | T4 `InputBar.tsx` |
| Enter to send, Shift+Enter = newline | T4 `InputBar.tsx` |
| Disable send while streaming | T4 `InputBar.tsx` |
| Disable send if empty or >2000 chars | T4 `InputBar.tsx` |
| Character counter within 200 of limit | T4 `InputBar.tsx` |
| Config fetch fail → no widget | T6 `App.tsx` (renders nothing for widget) |
| Session create fail → retry button | T5 `ChatWidget.tsx` |
| Vite proxy `/api/*` → `:3000` with origin rewrite | T1 `vite.config.ts` |
| `apps/widget` added to monorepo workspaces | T1 `package.json` already has `apps/*` glob |

All requirements covered.

### Placeholder scan

No TBD, TODO, or incomplete sections found.

### Type consistency

- `Message` type defined in `useChat.ts` and imported by `MessageBubble`, `MessageList` — consistent.
- `WidgetConfigResponse` from `@bank-chatbot/shared` used consistently.
- `ChatSseEvent` used in `client.ts` callbacks with `Extract<>` narrowing — consistent with shared types.
- `addGreeting` defined in `useChat.ts`, called in `ChatWidget.tsx` — consistent.
