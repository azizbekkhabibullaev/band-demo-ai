import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { KpiCard } from '../components/KpiCard.tsx';
import { LineChart, HBar } from '../components/MiniChart.tsx';
import { getDashboard, type DashboardData } from '../api/client.ts';

const PERIOD_OPTIONS = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
];

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#94a3b8',
};

const STATUS_COLOR: Record<string, string> = {
  open: '#ef4444',
  under_review: '#f59e0b',
  resolved: '#34d399',
};

function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function fmtMs(n: number) { return `${n.toFixed(0)}ms`; }

export function DashboardPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    getDashboard(days)
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [days]);

  const volumeChartData = (data?.volume ?? []).map(v => ({
    label: new Date(v.date).toLocaleDateString('en', { weekday: 'short' }),
    value: v.turns,
  }));

  const maxTopic = Math.max(...(data?.topics ?? []).map(t => t.count), 1);

  return (
    <AdminLayout title="Dashboard">
      <div className="px-6 py-5 space-y-6">

        {/* Period selector + refresh */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.days}
                onClick={() => setDays(opt.days)}
                className={[
                  'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                  days === opt.days
                    ? 'bg-blue-600 text-white'
                    : 'text-white/50 hover:text-white',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {loading && (
            <span className="text-[11px] text-white/30 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
              Loading…
            </span>
          )}
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
            {error}
          </div>
        )}

        {/* KPI Cards */}
        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard
                label="Total Conversations"
                value={data.kpi.totalTurns.toLocaleString()}
                sub={`${data.kpi.totalSessions.toLocaleString()} sessions`}
                icon="💬"
                accent="#3b82f6"
              />
              <KpiCard
                label="Today's Sessions"
                value={data.kpi.uniqueSessionsToday.toLocaleString()}
                sub="unique users today"
                icon="👥"
                accent="#8b5cf6"
              />
              <KpiCard
                label="AI Containment"
                value={fmtPct(data.kpi.containmentRate)}
                sub="resolved without escalation"
                trend={data.kpi.containmentRate > 0.8 ? 'up' : data.kpi.containmentRate < 0.6 ? 'down' : 'neutral'}
                trendLabel={data.kpi.containmentRate > 0.8 ? 'Excellent' : 'Needs improvement'}
                icon="🤖"
                accent="#34d399"
              />
              <KpiCard
                label="Lead Generation"
                value={fmtPct(data.kpi.leadRate)}
                sub="of sessions → lead"
                trend={data.kpi.leadRate > 0.05 ? 'up' : 'neutral'}
                trendLabel={`${Math.round(data.kpi.leadRate * data.kpi.totalTurns)} leads captured`}
                icon="📞"
                accent="#f59e0b"
              />
              <KpiCard
                label="Avg Response"
                value={fmtMs(data.kpi.avgLatencyMs)}
                sub="end-to-end latency"
                trend={data.kpi.avgLatencyMs < 2000 ? 'up' : data.kpi.avgLatencyMs > 4000 ? 'down' : 'neutral'}
                trendLabel={data.kpi.avgLatencyMs < 2000 ? 'Fast' : 'Acceptable'}
                icon="⚡"
                accent="#f97316"
              />
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Volume chart */}
              <div className="lg:col-span-2 bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-[13px] font-semibold text-white">Conversation Volume</h3>
                    <p className="text-[11px] text-white/40">Daily turns over the past {days} days</p>
                  </div>
                  <span className="text-[10px] font-mono text-white/30 bg-white/[0.04] px-2 py-1 rounded">
                    {data.kpi.totalTurns.toLocaleString()} total
                  </span>
                </div>
                {volumeChartData.length > 0 ? (
                  <LineChart data={volumeChartData} height={100} color="#3b82f6" />
                ) : (
                  <div className="h-[100px] flex items-center justify-center text-[12px] text-white/30">
                    No data yet
                  </div>
                )}
              </div>

              {/* Top topics */}
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
                <h3 className="text-[13px] font-semibold text-white mb-1">Top Topics</h3>
                <p className="text-[11px] text-white/40 mb-3">What customers are asking</p>
                <div className="space-y-0.5">
                  {data.topics.slice(0, 6).map((t, i) => (
                    <HBar
                      key={t.topic}
                      label={t.displayName}
                      value={t.count}
                      max={maxTopic}
                      pct={t.pct}
                      trend={t.trend}
                      rank={i}
                    />
                  ))}
                  {data.topics.length === 0 && (
                    <p className="text-[12px] text-white/30 py-4 text-center">No intent data yet</p>
                  )}
                </div>
              </div>
            </div>

            {/* Trends + Escalations row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Notable trends */}
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
                <h3 className="text-[13px] font-semibold text-white mb-1">Trends vs Previous Period</h3>
                <p className="text-[11px] text-white/40 mb-3">Compared to the prior {days} days</p>
                <div className="space-y-2">
                  {data.trends.filter(t => t.current > 0 || t.previous > 0).slice(0, 6).map(t => (
                    <div key={t.label} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
                      <span className="text-[12px] text-white/70">{t.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-white/40">{t.current.toLocaleString()}</span>
                        <span className={[
                          'text-[11px] font-semibold px-1.5 py-0.5 rounded',
                          t.direction === 'up' && t.isAnomaly ? 'bg-orange-500/20 text-orange-400' :
                          t.direction === 'up' ? 'bg-emerald-500/20 text-emerald-400' :
                          t.direction === 'down' ? 'bg-red-500/20 text-red-400' :
                          'bg-white/[0.06] text-white/40',
                        ].join(' ')}>
                          {t.changePct > 0 ? '+' : ''}{t.changePct}%
                          {t.isAnomaly ? ' ⚠' : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                  {data.trends.every(t => t.current === 0 && t.previous === 0) && (
                    <p className="text-[12px] text-white/30 py-4 text-center">No trend data yet</p>
                  )}
                </div>
              </div>

              {/* Open escalations */}
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-[13px] font-semibold text-white">Open Escalations</h3>
                    <p className="text-[11px] text-white/40">Issues requiring attention</p>
                  </div>
                  {data.escalations.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-400">
                      {data.escalations.length}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {data.escalations.slice(0, 4).map(esc => (
                    <div key={esc.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ background: SEVERITY_COLOR[esc.severity] ?? '#94a3b8' }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-white/80 truncate">{esc.title}</div>
                        <div className="text-[10px] text-white/40 mt-0.5">
                          {esc.category} · {esc.triggerCount} triggers
                        </div>
                      </div>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0"
                        style={{ background: `${STATUS_COLOR[esc.status]}22`, color: STATUS_COLOR[esc.status] }}>
                        {esc.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                  {data.escalations.length === 0 && (
                    <div className="text-center py-6">
                      <div className="text-2xl mb-1.5">✅</div>
                      <p className="text-[12px] text-white/40">No open escalations</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {!loading && !data && !error && (
          <div className="text-center py-20 text-white/30 text-[13px]">No data available</div>
        )}
      </div>
    </AdminLayout>
  );
}
