# Modernization Plan — Banking AI Platform
**Target:** Premium Banking AI Platform, 2026 standard  
**Current state:** Functional chatbot widget  
**Approach:** Incremental, no architecture changes, no backend changes

---

## Guiding Principle

> Every change in this plan touches only `apps/widget/src/`. Zero backend changes. Zero infrastructure changes. Each phase is independently shippable and demo-able.

---

## Phase 0 — Foundation (1–2 hours)
*Must do before anything else. Fixes fundamentals.*

### 0.1 Install Inter font
Add to `apps/widget/index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

### 0.2 Install `tailwindcss-animate`
```bash
npm install -w apps/widget tailwindcss-animate
```
Add to `tailwind.config.js`:
```js
plugins: [require('tailwindcss-animate')],
```

### 0.3 Expand CSS variables
Replace `apps/widget/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --accent:         37 99 235;     /* blue-600 */
    --accent-hover:   29 78 216;     /* blue-700 */
    --accent-light:   239 246 255;   /* blue-50 */
    --surface-1:      248 250 252;   /* slate-50 */
    --surface-2:      241 245 249;   /* slate-100 */
    --border:         226 232 240;   /* slate-200 */
    --text-primary:   15 23 42;      /* slate-900 */
    --text-secondary: 71 85 105;     /* slate-600 */
    --text-muted:     148 163 184;   /* slate-400 */
    --success:        16 185 129;    /* emerald-500 */
    --online:         34 197 94;     /* green-500 */
  }

  * {
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
}
```

**Deliverable:** Inter font renders, animation utilities available, semantic colors ready.  
**Impact:** HIGH | **Effort:** 30 min | **Demo-ready:** No (foundation only)

---

## Phase 1 — Visual Polish (2–3 hours)
*Makes the widget look premium. No UX structure changes.*

### 1.1 Widget container — depth + glass
`ChatWidget.tsx` — replace container className:
```tsx
// Before
"w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"

// After
"w-[400px] h-[600px] bg-white rounded-[20px] flex flex-col overflow-hidden"
+ "shadow-[0_24px_80px_-12px_rgba(0,0,0,0.22),0_4px_12px_-4px_rgba(0,0,0,0.08)]"
+ "ring-1 ring-slate-200/60"
```

### 1.2 Open/close animation
Wrap the chat panel in an animated div:
```tsx
<div
  className={cn(
    "transition-all duration-200 ease-out origin-bottom-right",
    isOpen
      ? "opacity-100 scale-100 translate-y-0"
      : "opacity-0 scale-95 translate-y-3 pointer-events-none"
  )}
>
  {/* chat panel */}
</div>
```

### 1.3 Header redesign
`Header.tsx` — full rewrite:
```tsx
export function Header({ displayName, onClose }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5
      bg-gradient-to-r from-blue-700 to-blue-600 text-white rounded-t-[20px]
      shrink-0">
      {/* Left: Logo + name + status */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center
          justify-center shrink-0 text-xs font-bold">
          IB
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight truncate">
            {displayName}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400
              shadow-[0_0_4px_rgba(74,222,128,0.8)]" />
            <span className="text-[10px] text-blue-100 font-medium">
              AI • Online
            </span>
          </div>
        </div>
      </div>
      {/* Right: close button */}
      <button onClick={onClose} aria-label="Close chat"
        className="w-7 h-7 rounded-full hover:bg-white/15 transition-colors
          flex items-center justify-center shrink-0 ml-2">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}
```

### 1.4 Assistant bubble redesign
`MessageBubble.tsx` — assistant bubble className:
```tsx
// Before
"max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed break-words bg-gray-100 text-gray-800 rounded-bl-sm banker-prose"

// After
"max-w-[88%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[14.5px]
 leading-relaxed break-words bg-slate-50 text-slate-800
 ring-1 ring-slate-200/70 shadow-sm banker-prose"
```

Add AI avatar to the left:
```tsx
<div className="flex justify-start mb-3 gap-2 items-end">
  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-blue-700
    flex items-center justify-center shrink-0 mb-0.5 shadow-sm">
    <span className="text-white text-[9px] font-bold">AI</span>
  </div>
  <div className="bubble...">...</div>
</div>
```

### 1.5 User bubble refinement
```tsx
// After
"max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[14.5px]
 leading-relaxed break-words text-white
 bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm"
```

### 1.6 Typing indicator — breathing dots
`TypingIndicator.tsx`:
```tsx
export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3 gap-2 items-end">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600
        to-blue-700 flex items-center justify-center shrink-0 mb-0.5">
        <span className="text-white text-[9px] font-bold">AI</span>
      </div>
      <div className="bg-slate-50 ring-1 ring-slate-200/70 rounded-2xl
        rounded-bl-sm px-4 py-3 flex gap-1.5 items-center shadow-sm">
        {[0, 1, 2].map(i => (
          <span key={i}
            className="w-2 h-2 bg-blue-400 rounded-full"
            style={{
              animation: 'typing-bounce 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```
Add to `index.css`:
```css
@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-5px); opacity: 1; }
}
```

### 1.7 Message enter animations
Wrap each `MessageBubble` in:
```tsx
<div className="animate-in slide-in-from-bottom-2 fade-in duration-200">
```

### 1.8 Input bar — focus ring + polish
`InputBar.tsx`:
```tsx
// Wrap div:
"border-t border-slate-200 px-3 py-3 bg-white/95 rounded-b-[20px]"

// Textarea:
"flex-1 resize-none rounded-xl border border-slate-200 bg-white
 px-3 py-2 text-[14px] outline-none leading-6 min-h-[36px] max-h-[96px]
 focus:border-blue-400 focus:ring-2 focus:ring-blue-100/60
 disabled:opacity-40 transition-all duration-150
 placeholder:text-slate-400"

// Placeholder:
placeholder="Ask about deposits, loans, cards…"

// Send button:
"shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-blue-700
 text-white flex items-center justify-center
 disabled:opacity-30 hover:shadow-[0_4px_12px_rgba(37,99,235,0.4)]
 active:scale-95 transition-all duration-150"
```

### 1.9 FAB button — glow + presence
`WidgetButton.tsx`:
```tsx
"w-[60px] h-[60px] rounded-full
 bg-gradient-to-br from-blue-600 to-blue-700 text-white
 shadow-[0_8px_32px_rgba(37,99,235,0.45)]
 flex items-center justify-center
 hover:shadow-[0_12px_40px_rgba(37,99,235,0.55)]
 active:scale-95 transition-all duration-150"
```

### 1.10 Trust footer
Add to `ChatWidget.tsx` below `InputBar`:
```tsx
<div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50/50
  rounded-b-[20px] flex items-center justify-between">
  <span className="text-[10px] text-slate-400">
    🔒 Responses are informational. Consult a specialist for binding decisions.
  </span>
</div>
```

**Deliverable:** Widget looks modern, premium, polished. Demo-ready.  
**Impact:** VERY HIGH | **Effort:** 2–3 hours | **Demo-ready:** YES ✅

---

## Phase 2 — Conversation UX (3–4 hours)
*Transforms usability. Biggest UX jump.*

### 2.1 Empty state with quick-topic chips

Replace the "Start a conversation below." placeholder in `MessageList.tsx`:

```tsx
const QUICK_TOPICS = {
  uz: [
    { icon: '💰', label: 'Depozit tanlash' },
    { icon: '🏠', label: 'Kredit olish' },
    { icon: '💳', label: 'Karta rasmiylashtirish' },
    { icon: '📞', label: 'Mutaxassis bilan bog\'lanish' },
  ],
  ru: [
    { icon: '💰', label: 'Подобрать вклад' },
    { icon: '🏠', label: 'Взять кредит' },
    { icon: '💳', label: 'Оформить карту' },
    { icon: '📞', label: 'Связаться со специалистом' },
  ],
  en: [
    { icon: '💰', label: 'Find a deposit' },
    { icon: '🏠', label: 'Get a loan' },
    { icon: '💳', label: 'Open a card' },
    { icon: '📞', label: 'Talk to a specialist' },
  ],
};

// In empty state:
<div className="flex flex-col items-center gap-4 px-4 py-6">
  <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center
    justify-center shadow-md">
    <span className="text-white text-xl">✨</span>
  </div>
  <p className="text-sm text-slate-600 text-center font-medium">
    What can I help you with today?
  </p>
  <div className="grid grid-cols-2 gap-2 w-full">
    {topics.map(t => (
      <button key={t.label} onClick={() => onTopicSelect(t.label)}
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl
          bg-white border border-slate-200 text-sm text-slate-700 font-medium
          hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700
          transition-all duration-150 text-left shadow-sm">
        <span>{t.icon}</span>
        <span className="leading-tight text-xs">{t.label}</span>
      </button>
    ))}
  </div>
</div>
```

### 2.2 Streaming cursor

Add to `MessageBubble.tsx` when `message.streaming`:
```tsx
{message.streaming && (
  <span
    className="inline-block w-[2px] h-[14px] bg-blue-500 ml-0.5 align-middle"
    style={{ animation: 'cursor-blink 0.8s step-end infinite' }}
  />
)}
```
```css
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
```

### 2.3 Language switcher in header
Add `lang` prop to `Header` and render:
```tsx
<div className="flex gap-1 mx-2">
  {(['uz', 'ru'] as const).map(l => (
    <button key={l} onClick={() => onLangChange(l)}
      className={cn(
        "text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition-colors",
        lang === l
          ? "bg-white/25 text-white"
          : "text-white/60 hover:text-white/80"
      )}>
      {l.toUpperCase()}
    </button>
  ))}
</div>
```

### 2.4 Scroll-to-bottom button
Add to `MessageList.tsx` — appears when user scrolls up:
```tsx
{showScrollDown && (
  <button
    onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
    className="absolute bottom-3 left-1/2 -translate-x-1/2
      bg-white border border-slate-200 shadow-md rounded-full
      px-3 py-1.5 text-xs text-slate-600 font-medium
      hover:bg-slate-50 transition-all flex items-center gap-1
      animate-in fade-in slide-in-from-bottom-1 duration-200">
    ↓ New message
  </button>
)}
```

### 2.5 Callback CTA button (lead generation)
In `useChat.ts`, detect `callbackIntent` in the done event.
In `MessageBubble.tsx`, render a CTA row after escalation messages:
```tsx
{message.escalation && (
  <div className="mt-2 pt-2 border-t border-slate-200">
    <button className="w-full py-2 rounded-xl
      bg-gradient-to-r from-blue-600 to-blue-700 text-white
      text-sm font-semibold shadow-sm
      hover:shadow-md active:scale-[0.98] transition-all duration-150">
      📞 Request a Callback
    </button>
  </div>
)}
```

**Deliverable:** Dramatically better UX. Topic chips, streaming cursor, language switching.  
**Impact:** VERY HIGH | **Effort:** 3–4 hours | **Demo-ready:** YES ✅✅

---

## Phase 3 — Premium Features (4–6 hours)
*WOW factor for executive demos.*

### 3.1 Product Recommendation Cards
Parse the AI output for the `🥇`/`🥈`/`🥉` pattern and render as structured cards instead of markdown.

`components/ProductCard.tsx`:
```tsx
interface ProductCardProps {
  rank: 1 | 2 | 3;
  name: string;
  tagline: string;
  highlights: string[];
  ctaLabel: string;
}

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
const BORDER = {
  1: 'ring-2 ring-amber-300/60 bg-amber-50/30',
  2: 'ring-1 ring-slate-200',
  3: 'ring-1 ring-slate-200',
};

export function ProductCard({ rank, name, tagline, highlights, ctaLabel }: ProductCardProps) {
  return (
    <div className={cn(
      "rounded-xl p-3 mb-2 bg-white shadow-sm transition-shadow hover:shadow-md",
      BORDER[rank]
    )}>
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-lg">{MEDAL[rank]}</span>
        <div>
          <div className="text-sm font-semibold text-slate-900">{name}</div>
          <div className="text-xs text-slate-500 mt-0.5">{tagline}</div>
        </div>
      </div>
      <ul className="space-y-0.5 mb-2">
        {highlights.map((h, i) => (
          <li key={i} className="text-xs text-slate-600 flex gap-1">
            <span>{h}</span>
          </li>
        ))}
      </ul>
      <button className="w-full py-1.5 rounded-lg bg-blue-600 text-white
        text-xs font-semibold hover:bg-blue-700 active:scale-[0.98]
        transition-all duration-100">
        {ctaLabel}
      </button>
    </div>
  );
}
```

### 3.2 Source citation chips
After KB-verified responses, render source chips:
```tsx
{message.sourceDoc && (
  <div className="mt-1.5 flex flex-wrap gap-1">
    <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded-full
      bg-slate-100 border border-slate-200 flex items-center gap-1">
      📄 {message.sourceDoc}
    </span>
  </div>
)}
```

### 3.3 Feedback buttons
After each complete AI message:
```tsx
{!message.streaming && message.role === 'assistant' && (
  <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100
    transition-opacity">
    <button className="text-slate-300 hover:text-green-500
      transition-colors text-sm">👍</button>
    <button className="text-slate-300 hover:text-red-400
      transition-colors text-sm">👎</button>
  </div>
)}
```

### 3.4 Responsive mobile layout
`ChatWidget.tsx` — conditional classes:
```tsx
// Mobile: full-width, safe-area aware
// Desktop: 400px floating panel
className="
  fixed z-50
  max-md:inset-x-3 max-md:bottom-[calc(env(safe-area-inset-bottom)+80px)]
  md:bottom-6 md:right-6
  flex flex-col items-end gap-3
"
// Panel:
"
  max-md:w-full
  md:w-[400px]
  max-md:h-[85svh]
  md:h-[600px]
"
```

### 3.5 Proactive greeting with typewriter effect
On widget open, instead of showing greeting instantly:
```tsx
function useTypewriter(text: string, speed = 20) {
  const [displayed, setDisplayed] = useState('');
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      setDisplayed(text.slice(0, ++i));
      if (i >= text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return displayed;
}
```

**Deliverable:** Product cards, source chips, feedback, mobile layout, typewriter greeting.  
**Impact:** VERY HIGH | **Effort:** 4–6 hours | **Demo-ready:** YES ✅✅✅

---

## Phase 4 — Demo Perfection (2–3 hours)
*Polish that makes executives say WOW.*

### 4.1 Animated entry for FAB button
```tsx
// Entrance on first load
"animate-in zoom-in-75 fade-in duration-500 delay-300"
```

### 4.2 Gradient message list background
Replace plain white scroll area:
```
bg-gradient-to-b from-slate-50/0 via-white to-white
```

### 4.3 Time grouping between messages
Show "Just now" / "2 minutes ago" dividers between message clusters.

### 4.4 Session continuity indicator
"Continuing from your last session" chip at top of message list if there are prior messages.

### 4.5 Demo mode quick-launch
For executive demos: pressing `Cmd+K` opens the widget and immediately sends a seed question.

---

## Implementation Order Summary

| Phase | Time | Impact | What you get |
|---|---|---|---|
| **Phase 0** — Foundation | 30 min | Medium | Inter font, colors, animation utils |
| **Phase 1** — Visual Polish | 2–3 hrs | VERY HIGH | Looks premium, demo-ready |
| **Phase 2** — Conversation UX | 3–4 hrs | VERY HIGH | Topic chips, streaming cursor, lang toggle |
| **Phase 3** — Premium Features | 4–6 hrs | HIGH | Product cards, mobile, feedback |
| **Phase 4** — Demo Perfection | 2–3 hrs | MEDIUM | Final WOW polish |
| **Total** | **~13 hrs** | | Full transformation |

---

## Non-Goals (do not do)

- ❌ Backend changes
- ❌ RAG or prompt changes
- ❌ Infrastructure changes
- ❌ New dependencies beyond `tailwindcss-animate` + font
- ❌ Full redesign of component structure
