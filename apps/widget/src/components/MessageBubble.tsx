import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { Message } from '../hooks/useChat.ts';
import { ProductCard, parseMessageBlocks } from './ProductCard.tsx';

interface Props {
  message: Message;
  onQuickReply?: (text: string) => void;
  isLast?: boolean;
  lang?: string;
}

// ─── Localized strings ────────────────────────────────────────────────────────
const STRINGS = {
  uz: {
    sourceKb:   "🏦 Ipoteka Bank ma'lumotlar bazasi",
    specialist: "🤝 Mutaxassis bilan bog'lanish",
    call:       '📞 Qo\'ng\'iroq qilish',
    callback:   '📋 Qayta qo\'ng\'iroq so\'rash',
  },
  ru: {
    sourceKb:   '🏦 База знаний Ipoteka Bank',
    specialist: '🤝 Соединение со специалистом',
    call:       '📞 Позвонить',
    callback:   '📋 Заказать обратный звонок',
  },
  en: {
    sourceKb:   '🏦 Ipoteka Bank knowledge base',
    specialist: '🤝 Connecting with a specialist',
    call:       '📞 Call',
    callback:   '📋 Request a callback',
  },
} as const;

function tr(lang: string) {
  return STRINGS[lang as keyof typeof STRINGS] ?? STRINGS['ru'];
}

// ─── Trust badge (replaces old ConfidenceBar) ─────────────────────────────────
// Only shown for KB/FAQ-sourced answers. Never shows "AI knowledge" or scores.
function TrustBadge({ routingTier, lang }: { routingTier?: string; lang: string }) {
  const isKb = routingTier === 'kb_context' || routingTier === 'faq';
  if (!isKb) return null;
  return (
    <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-100">
      <span className="text-[10px] text-emerald-700 font-medium leading-tight">
        {tr(lang).sourceKb}
      </span>
    </div>
  );
}

// ─── Escalation CTA ───────────────────────────────────────────────────────────
function EscalationCTA({ hotline, lang }: { hotline: string; lang: string }) {
  const s = tr(lang);
  return (
    <div className="mt-3 space-y-2 w-full">
      <a
        href={`tel:${hotline.replace(/\s/g, '')}`}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-white
          text-[13px] font-semibold active:scale-[0.98] transition-all duration-100 shadow-sm"
        style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}
      >
        {s.call} {hotline}
      </a>
      <button
        onClick={() => {/* callback modal — future */}}
        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl
          text-blue-700 text-[12.5px] font-medium border border-blue-200
          bg-blue-50 hover:bg-blue-100 active:scale-[0.98] transition-all duration-100"
      >
        {s.callback}
      </button>
    </div>
  );
}

// ─── Quick reply chips ────────────────────────────────────────────────────────
function QuickReplies({ replies, onSelect }: { replies: string[]; onSelect: (t: string) => void }) {
  if (!replies.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {replies.map(r => (
        <button
          key={r}
          onClick={() => onSelect(r.replace(/^[\p{Emoji}\s]+/u, '').trim())}
          className="topic-chip text-[11.5px] font-medium text-blue-700 bg-blue-50
            border border-blue-200 rounded-full px-2.5 py-1 hover:bg-blue-100
            transition-colors duration-100"
        >
          {r}
        </button>
      ))}
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────
const mdComponents: Components = {
  h3: ({ children }) => (
    <p className="font-semibold text-slate-900 mt-2 mb-0.5 first:mt-0">{children}</p>
  ),
  h4: ({ children }) => (
    <p className="font-semibold text-slate-700 mt-1.5 mb-0.5 first:mt-0">{children}</p>
  ),
  p: ({ children }) => (
    <p className="mb-1.5 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-1.5 space-y-0.5 pl-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-1.5 space-y-0.5 pl-4 list-decimal">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex gap-1.5 items-start">
      <span className="shrink-0 mt-0.5 text-slate-400">•</span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  hr: () => <hr className="my-2 border-slate-200" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="text-blue-600 underline underline-offset-2 break-all">{children}</a>
  ),
};

// ─── Main component ───────────────────────────────────────────────────────────
export function MessageBubble({ message, onQuickReply, isLast = false, lang = 'ru' }: Props) {

  // System messages (escalation pill)
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-3 msg-in">
        <div className="flex flex-col items-center gap-2.5 w-full max-w-[92%]">
          <span className="text-[11px] text-slate-500 bg-slate-100 rounded-full px-4 py-1.5 text-center">
            {tr(lang).specialist}
          </span>
          <EscalationCTA hotline={message.content} lang={lang} />
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';

  // User bubble
  if (isUser) {
    return (
      <div className="flex justify-end mb-2.5 msg-in">
        <div className="max-w-[78%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[13.5px]
          leading-relaxed break-words overflow-hidden text-white shadow-sm"
          style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}>
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant bubble
  const blocks = parseMessageBlocks(message.content);
  const hasProducts = blocks.some(b => b.type === 'product');

  return (
    <div className="flex justify-start mb-3 gap-2 items-end msg-in">
      {/* Bank AI avatar */}
      <div className="w-7 h-7 rounded-full shrink-0 mb-0.5 flex items-center justify-center shadow-sm"
        style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' }}>
        <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
          <path d="M8 2L9.5 6.5H14L10.5 9L11.5 13.5L8 11L4.5 13.5L5.5 9L2 6.5H6.5L8 2Z"
            fill="white" fillOpacity="0.92"/>
        </svg>
      </div>

      {/* Bubble + chips */}
      <div className="flex-1 min-w-0 max-w-[84%]">
        <div className={[
          'rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13.5px] leading-relaxed',
          'break-words overflow-hidden',
          'bg-white ring-1 ring-slate-200/80 shadow-sm banker-prose text-slate-800',
          hasProducts ? 'pb-2' : '',
        ].join(' ')}>

          {blocks.map((block, i) => {
            if (block.type === 'product') {
              return (
                <ProductCard
                  key={i}
                  rank={(block.rank ?? 1) as 1|2|3}
                  name={block.name ?? ''}
                  tagline={block.tagline ?? ''}
                  highlights={block.highlights ?? []}
                  animationDelay={i * 80}
                  lang={lang}
                />
              );
            }
            return (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={mdComponents as any}>
                {block.content}
              </ReactMarkdown>
            );
          })}

          {/* Streaming cursor */}
          {message.streaming && message.content.length > 0 && (
            <span className="streaming-cursor" />
          )}

          {/* Trust badge — only for KB-sourced answers, no AI jargon */}
          {!message.streaming && (
            <TrustBadge routingTier={message.routingTier} lang={lang} />
          )}
        </div>

        {/* Quick replies — last assistant message only */}
        {!message.streaming && isLast && (message.suggestedReplies?.length ?? 0) > 0 && onQuickReply && (
          <QuickReplies replies={message.suggestedReplies!} onSelect={onQuickReply} />
        )}
      </div>
    </div>
  );
}
