interface Props {
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  icon?: string;
  accent?: string; // hex color
}

export function KpiCard({ label, value, sub, trend, trendLabel, icon, accent = '#3b82f6' }: Props) {
  const trendColor = trend === 'up' ? '#34d399' : trend === 'down' ? '#f87171' : '#94a3b8';
  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '–';

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#161b27] p-4 flex flex-col gap-3 hover:border-white/[0.12] transition-colors">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium text-white/50 uppercase tracking-wider">{label}</span>
        {icon && (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[14px]"
            style={{ background: `${accent}22`, border: `1px solid ${accent}33` }}>
            {icon}
          </div>
        )}
      </div>
      <div>
        <div className="text-[26px] font-bold text-white leading-none tracking-tight">{value}</div>
        {sub && <div className="text-[11px] text-white/40 mt-1">{sub}</div>}
      </div>
      {trendLabel && (
        <div className="text-[11px] font-medium" style={{ color: trendColor }}>
          {trendArrow} {trendLabel}
        </div>
      )}
    </div>
  );
}
