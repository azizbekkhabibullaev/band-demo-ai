# Chat Widget Frontend — Design Spec

## Goal

A floating React chat widget embedded in a mock bank demo page, backed by the existing Fastify SSE API. Users type messages, see streamed responses in real time, and see an escalation notice if the bot can't resolve their query.

## Architecture

**Workspace:** `apps/widget` — React 18, Vite, TypeScript, Tailwind CSS. Added to the monorepo's `apps/*` workspace glob; imports types from `@bank-chatbot/shared`.

**Dev server:** Port 5173. Vite's `server.proxy` forwards `/api/*` to `http://localhost:3000` and rewrites the `Origin` header to `http://localhost:3000`, so the backend's CORS check passes without any DB changes.

**Host page:** A minimal mock bank landing page (navbar + hero section) rendered by `App.tsx`. The chat widget floats over it in the bottom-right corner.

---

## File structure

```
apps/widget/
  src/
    main.tsx                 — mounts <App />
    App.tsx                  — fetches config, renders DemoPage + ChatWidget
    components/
      ChatWidget.tsx         — open/close state, session lifecycle
      WidgetButton.tsx       — FAB launcher button
      ChatPanel.tsx          — the chat window container
      Header.tsx             — bank name + close button
      MessageList.tsx        — scrollable list, auto-scrolls to bottom
      MessageBubble.tsx      — user (right/green) or assistant (left/gray) bubble
      TypingIndicator.tsx    — animated three-dot indicator while streaming
      InputBar.tsx           — auto-resizing textarea + send button
    hooks/
      useWidgetConfig.ts     — fetches /api/widget-config/demo-bank once
      useChat.ts             — message state, SSE stream consumer, send logic
    api/
      client.ts              — typed wrappers: fetchWidgetConfig, createSession, streamChat
    types.ts                 — re-exports from @bank-chatbot/shared
  index.html
  vite.config.ts             — proxy config
  tsconfig.json
  package.json
  tailwind.config.js
  postcss.config.js
```

---

## Components

### `App`
- Calls `useWidgetConfig()` on mount.
- Applies `--accent-color` CSS custom property from `branding.accentColor`.
- Renders `<DemoPage />` and `<ChatWidget config={config} />` when config is loaded.
- Renders nothing for the widget if config fetch fails (demo page still shows).

### `ChatWidget`
- Owns `isOpen: boolean` and `sessionId: string | null` state.
- On first open: calls `createSession()`, stores the session ID, adds `config.greeting[config.languages.default]` as a synthetic assistant bubble (no API call).
- Renders `<WidgetButton>` always; renders `<ChatPanel>` when `isOpen`.

### `WidgetButton`
- Circular FAB fixed to bottom-right. Background color from `--accent-color`.
- Chat icon when closed; X icon when open.

### `ChatPanel`
- Fixed-size panel (380 × 520px) anchored above the button.
- Contains `<Header>`, `<MessageList>`, `<TypingIndicator>`, `<InputBar>`.

### `Header`
- Shows `branding.displayName`. Close button (X) sets `isOpen = false`.

### `MessageList`
- Renders a `<MessageBubble>` per message in the array.
- `useEffect` with a ref auto-scrolls to the bottom whenever messages change.

### `MessageBubble`
- `role: 'user' | 'assistant' | 'system'`. 
- User: right-aligned, accent background. Assistant: left-aligned, gray background.
- System (escalation notice): centered, muted, shows hotline number.

### `TypingIndicator`
- Three animated dots. Shown while `isStreaming` is true and the last message is from the assistant.

### `InputBar`
- `<textarea>` that grows up to 4 rows. Submits on Enter (Shift+Enter = newline).
- Send button disabled while streaming or message is empty or over 2000 chars.
- Character counter shown when within 200 chars of the limit.

---

## Hooks

### `useWidgetConfig()`

```ts
type State =
  | { status: 'loading' }
  | { status: 'ok'; config: WidgetConfigResponse }
  | { status: 'error' };
```

Fetches `GET /api/widget-config/demo-bank` once. Returns the state object.

### `useChat(sessionId: string | null)`

```ts
interface Message {
  id: string;           // crypto.randomUUID()
  role: 'user' | 'assistant' | 'system';
  content: string;      // grows during streaming
  streaming?: boolean;  // true while delta events are arriving
  escalation?: boolean; // set on done event
}

interface UseChatReturn {
  messages: Message[];
  isStreaming: boolean;
  sendMessage: (text: string) => Promise<void>;
}
```

`sendMessage`:
1. Appends user message immediately.
2. Appends empty assistant message with `streaming: true`.
3. Calls `streamChat(sessionId, text)` from `api/client.ts`.
4. Each `delta` event: appends text to the last message's `content`.
5. `done` event: sets `streaming: false`, sets `escalation` flag; if `escalation: true`, appends a system message with the hotline.
6. `error` event: replaces the last message content with `event.fallback`, sets `streaming: false`.

---

## API client (`api/client.ts`)

```ts
fetchWidgetConfig(): Promise<WidgetConfigResponse>
createSession(tenantId: string): Promise<string>          // returns session_id
streamChat(
  sessionId: string,
  tenantId: string,
  message: string,
  callbacks: { onDelta: (t: string) => void; onDone: (e: DoneEvent) => void; onError: (e: ErrorEvent) => void }
): Promise<void>
```

`streamChat` uses `fetch` + `response.body.getReader()` with the same line-buffering pattern as the backend's `streamChatCompletion`. Parses `data: {...}\n\n` lines, dispatches to callbacks.

---

## Data flow

| Step | Trigger | Action |
|------|---------|--------|
| Mount | App loads | `useWidgetConfig()` → GET /api/widget-config/demo-bank |
| First open | User clicks FAB | `createSession()` → POST /api/session/new; add greeting bubble |
| Send | User submits text | Append user bubble → append empty assistant bubble → SSE stream |
| Delta | SSE `delta` event | Append text to last assistant bubble |
| Done | SSE `done` event | Finalize bubble; add system escalation notice if needed |
| Error | SSE `error` event | Replace bubble with fallback text |

---

## Styling

- Tailwind CSS via `@vitejs/plugin-react` + `tailwindcss` PostCSS plugin.
- `--accent-color` CSS custom property set at mount from `branding.accentColor`. Used in Tailwind via `bg-[--accent-color]` (arbitrary value syntax).
- No design system or component library — plain Tailwind utility classes only.
- Panel shadow, rounded corners, smooth open/close transition (`transition-all duration-200`).

---

## Error handling

| Scenario | Behaviour |
|----------|-----------|
| Widget config fetch fails | Widget button not rendered; demo page unaffected |
| Session creation fails | ChatPanel shows error message + retry button |
| SSE `error` event | Fallback text replaces streaming placeholder; input re-enables |
| Network drop mid-stream | Reader throws → treated as SSE error |
| Message > 2000 chars | Send button disabled; counter shown in red |
| Send while streaming | Input + send button disabled |

---

## Out of scope

- Persistent chat history across page reloads
- Language selector UI (auto-detect only)
- Mobile-responsive layout (desktop demo only)
- Unit tests for React components (no testing framework configured in this plan)
- Authentication or user identity
