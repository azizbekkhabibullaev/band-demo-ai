import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import type { Message } from '../hooks/useChat.ts';
import { ProductCard, parseMessageBlocks } from './ProductCard.tsx';

interface Props {
  message: Message;
  onQuickReply?: (text: string) => void;
  isLast?: boolean;
}

// ─── Confidence bar ───────────────────────────────────────────────────────────
function ConfidenceBar({ confidence, routingTier }: { confidence?: number; routingTier?: string }) {
  if (confidence === undefined) return null;
  const pct = Math.round(confidence * 100);
  const isKb = routingTier === 'kb_context' || routingTier === 'faq';
  const label = isKb ? 'Verified' : 'General';
  const barColor = pct >= 70 ? '#10b981' : pct >= 45 ? '#f59e0b' : '#94a3b8';

  return (
    <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-slate-100">
      <span className="text-[9.5px] text-slate-400 font-medium flex items-center gap-1">
        {isKb ? '📚' : '💡'}
        <span>Source: {isKb ? 'Bank catalog' : 'AI knowledge'}</span>
      </span>
      <div className="flex items-center gap-1 ml-auto">
        <div className="w-16 h-1 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
        <span className={`text-[9px] font-semibold ${isKb ? 'text-emerald-600' : 'text-slate-400'}`}>
          {label}
        </span>
      </div>
    </div>
  );
}

// ─── Escalation CTA ───────────────────────────────────────────────────────────
function EscalationCTA({ hotline }: { hotline: string }) {
  return (
    <div className="mt-3 space-y-2">
      <a
        href={`tel:${hotline.replace(/\s/g, '')}`}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-white text-[13px] font-semibold
          active:scale-[0.98] transition-all duration-100 shadow-sm"
        style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)' }}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
        </svg>
        📞 Call {hotline}
      </a>
      <button
        onClick={() => {/* callback modal — future */}}
        className="flex items-center justify-center gap-2 w-full py-2 rounded-xl
          text-blue-700 text-[12.5px] font-medium border border-blue-200
          bg-blue-50 hover:bg-blue-100 active:scale-[0.98] transition-all duration-100"
      >
        📋 Request a callback
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
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  hr: () => <hr className="my-2 border-slate-200" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="text-blue-600 underline underline-offset-2">{children}</a>
  ),
};

// ─── Main component ───────────────────────────────────────────────────────────
export function MessageBubble({ message, onQuickReply, isLast = false }: Props) {

  // System messages (escalation pill)
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-3 msg-in">
        <div className="flex flex-col items-center gap-2.5 w-full max-w-[90%]">
          <span className="text-[11px] text-slate-500 bg-slate-100 rounded-full px-4 py-1.5 text-center">
            🤝 Connecting you with a specialist
          </span>
          <EscalationCTA hotline={message.content} />
        </div>
      </div>
    );
  }

  const isUser = message.role === 'user';

  // User bubble
  if (isUser) {
    return (
      <div className="flex justify-end mb-2.5 msg-in">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[13.5px]
          leading-relaxed break-words text-white shadow-sm"
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
      {/* AI avatar */}
      <div className="w-7 h-7 rounded-full shrink-0 mb-0.5 flex items-center justify-center shadow-sm"
        style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' }}>
        <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
          <path d="M8 2L9.5 6.5H14L10.5 9L11.5 13.5L8 11L4.5 13.5L5.5 9L2 6.5H6.5L8 2Z"
            fill="white" fillOpacity="0.92"/>
        </svg>
      </div>

      <div className="flex-1 min-w-0 max-w-[88%]">
        {/* Main bubble */}
        <div className={[
          'rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13.5px] leading-relaxed break-words',
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

          {/* Trust / confidence indicator */}
          {!message.streaming && message.confidence !== undefined && (
            <ConfidenceBar confidence={message.confidence} routingTier={message.routingTier} />
          )}
        </div>

        {/* Quick reply chips — only on last AI message */}
        {!message.streaming && isLast && message.suggestedReplies && message.suggestedReplies.length > 0 && onQuickReply && (
          <QuickReplies replies={message.suggestedReplies} onSelect={onQuickReply} />
        )}
      </div>
    </div>
  );
}
