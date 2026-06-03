import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { LineChart } from '../components/MiniChart.tsx';
import { getTrends, getDashboard, type TrendItem, type VolumePoint } from '../api/client.ts';

const DIRECTION_STYLE: Record<string, string> = {
  up: 'text-emerald-400 bg-emerald-500/15',
  down: 'text-red-400 bg-red-500/15',
  stable: 'text-white/40 bg-white/[0.06]',
};

export function TrendsPage() {
  const [days, setDays] = useState(7);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [volume, setVolume] = useState<VolumePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getTrends(days), getDashboard(days)])
      .then(([t, d]) => {
        setTrends(t.trends);
        setVolume(d.volume);
      })
      .finally(() => setLoading(false));
  }, [days]);

  const anomalies = trends.filter(t => t.isAnomaly);
  const rising = trends.filter(t => t.direction === 'up' && !t.isAnomaly);
  const falling = trends.filter(t => t.direction === 'down');

  const volumeData = volume.map(v => ({
    label: new Date(v.date).toLocaleDateString('en', { weekday: 'short' }),
    value: v.turns,
  }));

  return (
    <AdminLayout title="Trends">
      <div className="px-6 py-5 space-y-5">
        {/* Period selector */}
        <div className="flex items-center gap-2">
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={['px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                days === d ? 'bg-blue-600 text-white' : 'bg-white/[0.04] text-white/50 hover:text-white'].join(' ')}>
              {d} days
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-white/30 py-12 text-[13px]">Loading trends…</div>
        ) : (
          <>
            {/* Anomalies alert */}
            {anomalies.length > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-orange-400 text-lg">⚠️</span>
                  <h3 className="text-[13px] font-semibold text-orange-300">Anomalies Detected</h3>
                </div>
                <div className="space-y-2">
                  {anomalies.map(t => (
                    <div key={t.label} className="flex items-center justify-between">
                      <span className="text-[12px] text-white/70">{t.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-white/40">{t.previous} → {t.current}</span>
                        <span className="text-[11px] font-bold text-orange-400">
                          {t.changePct > 0 ? '+' : ''}{t.changePct}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Volume chart */}
            <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
              <h3 className="text-[13px] font-semibold text-white mb-0.5">Conversation Volume</h3>
              <p className="text-[11px] text-white/40 mb-3">Daily message volume over {days} days</p>
              {volumeData.length > 0 ? (
                <LineChart data={volumeData} height={120} color="#3b82f6" />
              ) : (
                <div className="h-[120px] flex items-center justify-center text-[12px] text-white/30">No data</div>
              )}
            </div>

            {/* All trends grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {trends.filter(t => t.current > 0 || t.previous > 0).map(t => (
                <div key={t.label}
                  className={['bg-[#161b27] rounded-xl border p-4 transition-all',
                    t.isAnomaly ? 'border-orange-500/30' : 'border-white/[0.07]'].join(' ')}>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-[12px] font-medium text-white/70">{t.label}</span>
                    {t.isAnomaly && <span className="text-[10px] text-orange-400">⚠ Anomaly</span>}
                  </div>
                  <div className="text-[24px] font-bold text-white mb-1">{t.current.toLocaleString()}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-white/30">vs {t.previous.toLocaleString()}</span>
                    <span className={['text-[11px] font-semibold px-2 py-0.5 rounded-full',
                      DIRECTION_STYLE[t.direction]].join(' ')}>
                      {t.changePct > 0 ? '↑ +' : t.changePct < 0 ? '↓ ' : ''}{t.changePct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">{rising.length}</div>
                <div className="text-[11px] text-white/40 mt-1">Rising metrics</div>
              </div>
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 text-center">
                <div className="text-2xl font-bold text-orange-400">{anomalies.length}</div>
                <div className="text-[11px] text-white/40 mt-1">Anomalies</div>
              </div>
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{falling.length}</div>
                <div className="text-[11px] text-white/40 mt-1">Falling metrics</div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
