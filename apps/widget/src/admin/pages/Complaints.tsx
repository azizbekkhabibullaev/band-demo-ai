import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { getComplaints, type ComplaintStat } from '../api/client.ts';

const SEVERITY_META: Record<string, { color: string; bg: string; label: string }> = {
  high:   { color: '#ef4444', bg: 'bg-red-500/15',    label: 'High' },
  medium: { color: '#f59e0b', bg: 'bg-amber-500/15',  label: 'Medium' },
  low:    { color: '#94a3b8', bg: 'bg-slate-500/15',  label: 'Low' },
};

const TREND_META: Record<string, { symbol: string; color: string }> = {
  up:     { symbol: '↑', color: '#ef4444' },
  down:   { symbol: '↓', color: '#34d399' },
  stable: { symbol: '–', color: '#94a3b8' },
};

const CAT_ICONS: Record<string, string> = {
  mobile_app:      '📱',
  card:            '💳',
  branch:          '🏢',
  loan:            '🏠',
  deposit:         '💰',
  transfer:        '↔️',
  otp:             '🔐',
  service_quality: '⭐',
};

export function ComplaintsPage() {
  const [days, setDays] = useState(7);
  const [complaints, setComplaints] = useState<ComplaintStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getComplaints(days)
      .then(r => setComplaints(r.complaints))
      .finally(() => setLoading(false));
  }, [days]);

  const total = complaints.reduce((s, c) => s + c.count, 0);
  const maxCount = Math.max(...complaints.map(c => c.count), 1);
  const highSeverity = complaints.filter(c => c.severity === 'high' && c.count > 0);

  return (
    <AdminLayout title="Complaint Intelligence">
      <div className="px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Complaint Detection</h2>
            <p className="text-[12px] text-white/40 mt-0.5">
              Keyword-classified complaints across {total} flagged messages
            </p>
          </div>
          <div className="flex gap-1.5">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={['px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                  days === d ? 'bg-blue-600 text-white' : 'bg-white/[0.04] text-white/50 hover:text-white'].join(' ')}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-white/30 py-12 text-[13px]">Analyzing complaints…</div>
        ) : (
          <>
            {/* High severity alert */}
            {highSeverity.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🚨</span>
                  <h3 className="text-[13px] font-semibold text-red-300">High Severity Categories</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {highSeverity.map(c => (
                    <span key={c.category}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-500/20 text-red-300 border border-red-500/20">
                      {CAT_ICONS[c.category] ?? '⚠️'} {c.displayName} ({c.count})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 text-center">
                <div className="text-2xl font-bold text-white">{total}</div>
                <div className="text-[11px] text-white/40 mt-1">Total flagged</div>
              </div>
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 text-center">
                <div className="text-2xl font-bold text-red-400">
                  {complaints.filter(c => c.severity === 'high' && c.count > 0).length}
                </div>
                <div className="text-[11px] text-white/40 mt-1">High severity</div>
              </div>
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 text-center">
                <div className="text-2xl font-bold text-orange-400">
                  {complaints.filter(c => c.trend === 'up').length}
                </div>
                <div className="text-[11px] text-white/40 mt-1">Rising trends</div>
              </div>
            </div>

            {/* Complaint bars */}
            <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
              <h3 className="text-[13px] font-semibold text-white mb-3">Complaint Categories</h3>
              <div className="space-y-3">
                {complaints.map(c => {
                  const sev = SEVERITY_META[c.severity]!;
                  const trn = TREND_META[c.trend]!;
                  return (
                    <div key={c.category}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px]">{CAT_ICONS[c.category] ?? '⚠️'}</span>
                          <span className="text-[13px] font-medium text-white/80">{c.displayName}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${sev.bg}`}
                            style={{ color: sev.color }}>
                            {sev.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-medium text-white/60">{c.count}</span>
                          <span className="text-[11px] font-semibold" style={{ color: trn.color }}>
                            {trn.symbol} {c.trend}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${(c.count / maxCount) * 100}%`,
                            background: sev.color,
                            opacity: c.count === 0 ? 0.15 : 0.7,
                          }}
                        />
                      </div>
                      <div className="text-[10px] text-white/25 mt-0.5">{c.pct}% of total complaints</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {total === 0 && (
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-8 text-center">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-[13px] text-white/50">No complaints detected in this period</p>
                <p className="text-[11px] text-white/30 mt-1">
                  Complaint detection uses keyword matching on user messages.
                  As conversation volume grows, patterns will appear here.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
