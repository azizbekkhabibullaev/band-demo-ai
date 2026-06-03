import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { getInsights } from '../api/client.ts';

const INSIGHT_ICONS = ['📊', '💡', '🔍', '📈', '⚡'];

function InsightCard({ text, index, loading }: { text: string; index: number; loading?: boolean }) {
  const icon = INSIGHT_ICONS[index % INSIGHT_ICONS.length]!;

  if (loading) {
    return (
      <div className="bg-[#161b27] rounded-2xl border border-white/[0.07] p-5 animate-pulse">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/[0.05] shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-white/[0.05] rounded w-3/4" />
            <div className="h-3 bg-white/[0.05] rounded w-full" />
            <div className="h-3 bg-white/[0.05] rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group bg-[#161b27] rounded-2xl border border-white/[0.07] p-5
      hover:border-blue-500/25 hover:bg-[#1a2035] transition-all duration-300">
      <div className="flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[17px]"
          style={{ background: 'linear-gradient(135deg,#1d4ed820,#3b82f620)', border: '1px solid #3b82f630' }}>
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-[13.5px] text-white/85 leading-relaxed font-medium">{text}</p>
        </div>
      </div>
    </div>
  );
}

export function InsightsPage() {
  const [days, setDays] = useState(7);
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (d: number) => {
    setError('');
    try {
      const res = await getInsights(d);
      setInsights(res.insights);
      setLastRefreshed(new Date());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(days).finally(() => setLoading(false));
  }, [days, load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load(days);
    setRefreshing(false);
  }

  return (
    <AdminLayout title="AI Insights">
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-[17px] font-bold text-white flex items-center gap-2">
              🧠 Executive Intelligence
            </h2>
            <p className="text-[12px] text-white/40 mt-1">
              AI-generated insights from customer conversations — powered by GPT-4
            </p>
            {lastRefreshed && (
              <p className="text-[10px] text-white/25 mt-0.5">
                Last updated: {lastRefreshed.toLocaleTimeString()}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
              {[7, 14, 30].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={['px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                    days === d ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white'].join(' ')}>
                  {d}d
                </button>
              ))}
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600/20 border border-blue-500/30
                text-[12px] font-medium text-blue-400 hover:bg-blue-600/30 disabled:opacity-40 transition-all"
            >
              <svg className={['w-3.5 h-3.5', refreshing ? 'animate-spin' : ''].join(' ')}
                viewBox="0 0 24 24" fill="none">
                <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              {refreshing ? 'Generating…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
            {error}
          </div>
        )}

        {/* Insights grid */}
        <div className="grid gap-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <InsightCard key={i} text="" index={i} loading />
            ))
          ) : insights.length > 0 ? (
            insights.map((text, i) => (
              <InsightCard key={i} text={text} index={i} />
            ))
          ) : (
            <div className="bg-[#161b27] rounded-2xl border border-white/[0.07] p-10 text-center">
              <div className="text-4xl mb-3">🧠</div>
              <p className="text-[14px] text-white/50">No insights available yet</p>
              <p className="text-[12px] text-white/30 mt-1.5 max-w-xs mx-auto">
                Insights are generated from conversation data.
                As users interact with the chat, analytics will accumulate and insights will appear here.
              </p>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-8 bg-white/[0.02] rounded-xl border border-white/[0.05] p-4">
          <h3 className="text-[12px] font-semibold text-white/50 mb-2 uppercase tracking-wide">How Insights Work</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-center">
            {[
              { icon: '💬', label: 'Chat Conversations', desc: 'Real customer messages' },
              { icon: '📊', label: 'Analytics Engine', desc: 'Topics, complaints, trends' },
              { icon: '🧠', label: 'GPT-4 Analysis', desc: 'Pattern recognition' },
              { icon: '📋', label: 'Executive Report', desc: 'Actionable insights' },
            ].map((step, i) => (
              <div key={i} className="text-center">
                <div className="text-[22px] mb-1">{step.icon}</div>
                <div className="text-[11px] font-semibold text-white/60">{step.label}</div>
                <div className="text-[10px] text-white/30">{step.desc}</div>
                {i < 3 && <div className="hidden md:block text-white/20 text-lg absolute">→</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Voice AI readiness */}
        <div className="mt-4 bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🎙️</span>
            <h3 className="text-[13px] font-semibold text-white">Voice AI Architecture — Ready for Integration</h3>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-400 uppercase tracking-wide">Coming Soon</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            {[
              { icon: '🎵', label: 'Audio Input', desc: 'Phone calls, voice messages', status: 'ready' },
              { icon: '📝', label: 'Speech-to-Text', desc: 'Whisper API integration point', status: 'ready' },
              { icon: '🔍', label: 'Classification', desc: 'Topic & sentiment analysis', status: 'ready' },
              { icon: '🧠', label: 'Insights Engine', desc: 'Same pipeline as text', status: 'ready' },
            ].map(step => (
              <div key={step.label}
                className="flex items-start gap-2.5 p-3 bg-white/[0.02] rounded-lg border border-white/[0.05]">
                <span className="text-[16px]">{step.icon}</span>
                <div>
                  <div className="text-[11px] font-semibold text-white/70">{step.label}</div>
                  <div className="text-[10px] text-white/35">{step.desc}</div>
                  <div className="text-[9px] text-emerald-400 mt-0.5 font-medium">Interface ready</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
