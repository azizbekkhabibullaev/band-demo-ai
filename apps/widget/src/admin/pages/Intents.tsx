import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { getIntents, getTopics, type IntentEntry, type TopicStat } from '../api/client.ts';

const CAT_COLOR: Record<string, string> = {
  savings:   '#f59e0b',
  credit:    '#3b82f6',
  cards:     '#8b5cf6',
  accounts:  '#34d399',
  payments:  '#06b6d4',
  services:  '#ec4899',
  support:   '#94a3b8',
};

export function IntentsPage() {
  const [intents, setIntents] = useState<IntentEntry[]>([]);
  const [topics, setTopics] = useState<TopicStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([getIntents(), getTopics(days)])
      .then(([i, t]) => { setIntents(i.intents); setTopics(t.topics); })
      .finally(() => setLoading(false));
  }, [days]);

  const filtered = intents.filter(i =>
    !search ||
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.display_name_ru?.toLowerCase().includes(search.toLowerCase()) ||
    i.display_name_uz?.toLowerCase().includes(search.toLowerCase()),
  );

  // Merge intent definitions with live usage counts
  const withCounts = filtered.map(i => ({
    ...i,
    liveCount: topics.find(t => t.topic === i.name)?.count ?? 0,
    liveTrend: topics.find(t => t.topic === i.name)?.trend ?? 'stable',
    liveTrendPct: topics.find(t => t.topic === i.name)?.trendPct ?? 0,
  })).sort((a, b) => b.liveCount - a.liveCount);

  const maxKb = Math.max(...withCounts.map(i => i.kb_count ?? 0), 1);

  return (
    <AdminLayout title="Intent Intelligence">
      <div className="px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Customer Intent Map</h2>
            <p className="text-[12px] text-white/40 mt-0.5">
              {intents.length} registered intents · matched to {topics.length} active topics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search intents…"
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07]
                text-[12px] text-white placeholder-white/25 outline-none w-44 focus:border-blue-500/40"
            />
            {[7, 30].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={['px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                  days === d ? 'bg-blue-600 text-white' : 'bg-white/[0.04] text-white/40 hover:text-white'].join(' ')}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-white/30 py-12 text-[13px]">Loading intent data…</div>
        ) : (
          <>
            {/* Live usage leaders */}
            {topics.length > 0 && (
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
                <h3 className="text-[13px] font-semibold text-white mb-3">
                  🔥 Live Usage Ranking <span className="text-white/40 font-normal">(last {days} days)</span>
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  {topics.slice(0, 6).map((t, i) => {
                    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];
                    return (
                      <div key={t.topic}
                        className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-3 text-center">
                        <div className="text-xl mb-1">{medals[i]}</div>
                        <div className="text-[12px] font-semibold text-white/80">{t.displayName}</div>
                        <div className="text-[11px] text-white/40 mt-0.5">{t.count} queries</div>
                        <div className="text-[10px] mt-1"
                          style={{ color: t.trend === 'up' ? '#34d399' : t.trend === 'down' ? '#f87171' : '#94a3b8' }}>
                          {t.trend === 'up' ? '↑' : t.trend === 'down' ? '↓' : '–'}
                          {t.trendPct !== 0 ? ` ${Math.abs(t.trendPct)}%` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Intent table */}
            <div className="bg-[#161b27] rounded-xl border border-white/[0.07] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider">Intent</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider">Labels</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider">Category</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider">KB articles</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider">Live queries</th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold text-white/40 uppercase tracking-wider">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {withCounts.map(intent => {
                    const catColor = CAT_COLOR[intent.category] ?? '#94a3b8';
                    return (
                      <tr key={intent.intent_id}
                        className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="text-[12px] font-mono text-white/60">{intent.name}</div>
                          <div className="text-[10px] text-white/30">{intent.intent_id}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-[11px] text-white/70">{intent.display_name_ru ?? '—'}</div>
                          <div className="text-[10px] text-white/40">{intent.display_name_uz ?? '—'}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ background: `${catColor}22`, color: catColor }}>
                            {intent.category ?? 'other'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500/60 rounded-full"
                                style={{ width: `${((intent.kb_count ?? 0) / maxKb) * 100}%` }} />
                            </div>
                            <span className="text-[11px] text-white/50">{intent.kb_count ?? 0}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={['text-[12px] font-semibold',
                            intent.liveCount > 0 ? 'text-white' : 'text-white/25'].join(' ')}>
                            {intent.liveCount > 0 ? intent.liveCount.toLocaleString() : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {intent.liveCount > 0 ? (
                            <span className="text-[11px] font-semibold"
                              style={{ color: intent.liveTrend === 'up' ? '#34d399' : intent.liveTrend === 'down' ? '#f87171' : '#94a3b8' }}>
                              {intent.liveTrend === 'up' ? '↑' : intent.liveTrend === 'down' ? '↓' : '–'}
                              {intent.liveTrendPct !== 0 ? ` ${Math.abs(intent.liveTrendPct)}%` : ''}
                            </span>
                          ) : <span className="text-white/20">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {withCounts.length === 0 && (
                <div className="text-center py-8 text-white/30 text-[12px]">No intents found</div>
              )}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
