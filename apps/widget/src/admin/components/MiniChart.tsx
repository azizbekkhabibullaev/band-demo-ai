/**
 * Pure SVG line chart & bar chart — zero dependencies
 */

// ─── Line chart ───────────────────────────────────────────────────────────────

interface LineProps {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  fillOpacity?: number;
}

export function LineChart({ data, height = 80, color = '#3b82f6', fillOpacity = 0.15 }: LineProps) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const w = 400;
  const h = height;
  const pad = 4;

  const points = data.map((d, i) => ({
    x: pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2),
    y: h - pad - (d.value / max) * (h - pad * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const fillPath = `${linePath} L ${points[points.length - 1]!.x} ${h} L ${points[0]!.x} ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity * 2} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#grad-${color.replace('#','')})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots on last point */}
      {points.slice(-1).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={color} />
      ))}
    </svg>
  );
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

interface BarProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  barColor?: string;
  showLabels?: boolean;
}

export function BarChart({ data, height = 120, barColor = '#3b82f6', showLabels = true }: BarProps) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.max(8, Math.floor(380 / data.length) - 4);

  return (
    <svg viewBox={`0 0 400 ${height}`} className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.value / max) * (height - (showLabels ? 20 : 4)));
        const x = 10 + i * (400 / data.length);
        const y = height - (showLabels ? 20 : 4) - barH;
        const col = d.color ?? barColor;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH}
              rx="2" fill={col} fillOpacity="0.8" />
            {showLabels && (
              <text x={x + barW / 2} y={height - 4}
                textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.35)"
                fontFamily="system-ui">
                {d.label.slice(0, 3)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Horizontal bar (for topics/intents) ─────────────────────────────────────

interface HBarProps {
  label: string;
  value: number;
  max: number;
  pct: number;
  trend?: 'up' | 'down' | 'stable';
  color?: string;
  rank?: number;
}

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309', '#3b82f6', '#8b5cf6'];

export function HBar({ label, value, max, pct, trend, color, rank }: HBarProps) {
  const col = color ?? RANK_COLORS[(rank ?? 0) % RANK_COLORS.length]!;
  const trendSymbol = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';
  const trendColor = trend === 'up' ? '#34d399' : trend === 'down' ? '#f87171' : 'transparent';

  return (
    <div className="flex items-center gap-3 py-1.5">
      {rank !== undefined && (
        <span className="text-[11px] font-bold w-4 text-center" style={{ color: col }}>
          {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}`}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px] font-medium text-white/80 truncate">{label}</span>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <span className="text-[11px] text-white/40">{value.toLocaleString()}</span>
            {trendSymbol && <span className="text-[10px] font-bold" style={{ color: trendColor }}>{trendSymbol}</span>}
          </div>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${(value / Math.max(max, 1)) * 100}%`, background: col }} />
        </div>
      </div>
      <span className="text-[10px] text-white/30 w-8 text-right shrink-0">{pct}%</span>
    </div>
  );
}
