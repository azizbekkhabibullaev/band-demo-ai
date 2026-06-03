interface ProductCardProps {
  rank: 1 | 2 | 3;
  name: string;
  tagline: string;
  highlights: string[];
  animationDelay?: number;
}

const MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' } as const;
const LABEL = { 1: 'TOP PICK', 2: 'RUNNER UP', 3: 'ALSO CONSIDER' } as const;
const LABEL_STYLE = {
  1: 'bg-amber-50 text-amber-700 border border-amber-200',
  2: 'bg-slate-50 text-slate-500 border border-slate-200',
  3: 'bg-slate-50 text-slate-400 border border-slate-200',
} as const;
const CARD_STYLE = {
  1: 'shadow-card-gold ring-2 ring-amber-200/70',
  2: 'ring-1 ring-slate-200',
  3: 'ring-1 ring-slate-200',
} as const;

export function ProductCard({ rank, name, tagline, highlights, animationDelay = 0 }: ProductCardProps) {
  return (
    <div
      className={`product-card relative bg-white rounded-2xl p-3.5 mb-2 ${CARD_STYLE[rank]}`}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Top row: medal + name + badge */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-base leading-none mt-0.5 shrink-0">{MEDAL[rank]}</span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-slate-900 leading-tight">
              {name}
            </div>
            <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5 line-clamp-1">
              {tagline}
            </div>
          </div>
        </div>
        <span className={`text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded-md shrink-0 ${LABEL_STYLE[rank]}`}>
          {LABEL[rank]}
        </span>
      </div>

      {/* Highlights */}
      <ul className="space-y-0.5 mt-2">
        {highlights.map((h, i) => (
          <li key={i} className="text-[12.5px] text-slate-700 flex items-start gap-1.5 leading-relaxed">
            <span className="shrink-0">{h}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Parser: extract product cards from AI markdown text ─────────────────────

export interface ParsedBlock {
  type: 'markdown' | 'product';
  content: string;           // for markdown blocks
  rank?: 1 | 2 | 3;
  name?: string;
  tagline?: string;
  highlights?: string[];
}

const MEDAL_RE = /^(🥇|🥈|🥉)\s+\*\*(.+?)\*\*(?:\s*[-—]\s*(.+))?$/;
const HIGHLIGHT_RE = /^[-•*]\s+(.+)$|^(\p{Emoji})\s+(.+)$/u;

export function parseMessageBlocks(content: string): ParsedBlock[] {
  const lines = content.split('\n');
  const blocks: ParsedBlock[] = [];

  let mdLines: string[] = [];
  let currentCard: { rank: 1|2|3; name: string; tagline: string; highlights: string[] } | null = null;

  const flushMd = () => {
    const text = mdLines.join('\n').trim();
    if (text) blocks.push({ type: 'markdown', content: text });
    mdLines = [];
  };

  const flushCard = () => {
    if (currentCard) {
      blocks.push({
        type: 'product',
        content: '',
        rank: currentCard.rank,
        name: currentCard.name,
        tagline: currentCard.tagline,
        highlights: currentCard.highlights,
      });
      currentCard = null;
    }
  };

  for (const line of lines) {
    const medalMatch = MEDAL_RE.exec(line.trim());
    if (medalMatch) {
      flushMd();
      flushCard();
      const medal = medalMatch[1]!;
      const rank: 1|2|3 = medal === '🥇' ? 1 : medal === '🥈' ? 2 : 3;
      currentCard = {
        rank,
        name: medalMatch[2]!.trim(),
        tagline: medalMatch[3]?.trim() ?? '',
        highlights: [],
      };
      continue;
    }

    if (currentCard) {
      const trimmed = line.trim();
      if (trimmed === '') {
        // blank line after a card might separate from next — keep collecting
        continue;
      }
      // Check if this starts another medal (handled above by next iteration)
      const hlMatch = HIGHLIGHT_RE.exec(trimmed);
      if (hlMatch) {
        currentCard.highlights.push(trimmed.replace(/^[-•*]\s+/, ''));
        continue;
      }
      // Continuation text or unrecognized — flush card and add as markdown
      flushCard();
      mdLines.push(line);
      continue;
    }

    mdLines.push(line);
  }

  flushMd();
  flushCard();

  return blocks;
}
