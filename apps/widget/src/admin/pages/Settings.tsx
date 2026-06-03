import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { getStats, runEscalationEngine } from '../api/client.ts';

interface Stats {
  kb: { total: string; embedded: string; lang: string }[];
  faq: { total: string };
  intents: { total: string };
  sessions_7d: { total: string };
}

export function SettingsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningEngine, setRunningEngine] = useState(false);
  const [engineResult, setEngineResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tenant = localStorage.getItem('admin_tenant') ?? 'ipoteka-bank';
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string) ?? '';

  useEffect(() => {
    getStats()
      .then(s => setStats(s as Stats))
      .finally(() => setLoading(false));
  }, []);

  async function handleRunEngine() {
    setRunningEngine(true);
    setEngineResult(null);
    try {
      const res = await runEscalationEngine();
      setEngineResult(res.created > 0
        ? `✅ Created ${res.created} new escalation event(s)`
        : '✅ No new escalations detected');
    } catch (e) {
      setEngineResult(`❌ ${String(e)}`);
    } finally {
      setRunningEngine(false);
    }
  }

  function copyCredentials() {
    const text = `Admin URL: ${window.location.origin}/admin\nUsername: admin\nPassword: (set via ADMIN_PASSWORD env var)`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const totalKb = stats?.kb.reduce((s, r) => s + parseInt(r.total, 10), 0) ?? 0;
  const embeddedKb = stats?.kb.reduce((s, r) => s + parseInt(r.embedded, 10), 0) ?? 0;

  return (
    <AdminLayout title="Settings">
      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <h2 className="text-[15px] font-semibold text-white">System Settings</h2>

        {/* Platform info */}
        <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wide mb-3">Platform Info</h3>
          <dl className="space-y-2">
            {[
              { label: 'Tenant ID', value: tenant },
              { label: 'API Endpoint', value: apiBase || '(same origin)' },
              { label: 'Environment', value: import.meta.env.MODE ?? 'production' },
              { label: 'Admin URL', value: `${window.location.origin}/admin` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
                <dt className="text-[11px] text-white/40">{label}</dt>
                <dd className="text-[12px] font-mono text-white/70">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Knowledge base stats */}
        <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wide mb-3">Knowledge Base</h3>
          {loading ? (
            <div className="text-[12px] text-white/30">Loading…</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'KB Articles', value: totalKb },
                  { label: 'Embedded', value: embeddedKb },
                  { label: 'FAQ Entries', value: parseInt(stats?.faq.total ?? '0', 10) },
                  { label: 'Intents', value: parseInt(stats?.intents.total ?? '0', 10) },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center p-3 bg-white/[0.03] rounded-lg">
                    <div className="text-[20px] font-bold text-white">{value.toLocaleString()}</div>
                    <div className="text-[10px] text-white/40 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              {/* Per-language breakdown */}
              {stats?.kb.map(r => (
                <div key={r.lang} className="flex items-center justify-between text-[12px]">
                  <span className="text-white/50">{r.lang.toUpperCase()} articles</span>
                  <span className="text-white/70">
                    {parseInt(r.embedded, 10)} / {parseInt(r.total, 10)} embedded
                  </span>
                  <div className="w-32 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/60 rounded-full"
                      style={{ width: `${(parseInt(r.embedded, 10) / Math.max(parseInt(r.total, 10), 1)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Authentication */}
        <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wide mb-3">Authentication</h3>
          <p className="text-[12px] text-white/60 mb-3">
            Admin credentials are managed via environment variables on the backend server.
          </p>
          <div className="space-y-2 text-[12px]">
            {[
              { key: 'ADMIN_USERNAME', desc: 'Login username (default: admin)' },
              { key: 'ADMIN_PASSWORD', desc: 'Login password (required)' },
              { key: 'ADMIN_JWT_SECRET', desc: 'JWT signing secret (required)' },
            ].map(({ key, desc }) => (
              <div key={key} className="flex items-center gap-3 p-2.5 bg-white/[0.03] rounded-lg">
                <code className="font-mono text-[11px] text-amber-400/80 w-44">{key}</code>
                <span className="text-white/40">{desc}</span>
              </div>
            ))}
          </div>
          <button
            onClick={copyCredentials}
            className="mt-3 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.05] text-white/50 hover:text-white transition-all"
          >
            {copied ? '✅ Copied!' : '📋 Copy demo credentials info'}
          </button>
        </div>

        {/* Escalation engine */}
        <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wide mb-1">Auto-Escalation Engine</h3>
          <p className="text-[12px] text-white/40 mb-3">
            Scans last 24h of messages for complaint spikes. Automatically creates escalation events when a category reaches 10+ complaints.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunEngine}
              disabled={runningEngine}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold text-white disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)' }}
            >
              {runningEngine ? '⏳ Running scan…' : '🚨 Run Escalation Scan'}
            </button>
            {engineResult && (
              <span className="text-[12px] text-white/60">{engineResult}</span>
            )}
          </div>
        </div>

        {/* Voice AI */}
        <div className="bg-[#161b27] rounded-xl border border-amber-500/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎙️</span>
            <h3 className="text-[12px] font-semibold text-amber-400/80">Voice AI — Architecture Ready</h3>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-400 uppercase">Pending</span>
          </div>
          <p className="text-[12px] text-white/40 mb-2">
            The system is architected for voice AI integration. Database models and interfaces are in place.
          </p>
          <div className="space-y-1">
            {[
              { ready: true,  label: 'voice_calls table created in database' },
              { ready: true,  label: 'TranscriptionProvider interface defined (callcenter/types.ts)' },
              { ready: true,  label: 'ClassificationProvider interface defined' },
              { ready: true,  label: 'AgentAssist interface defined' },
              { ready: false, label: 'Whisper API integration (plug-in when ready)' },
              { ready: false, label: 'Telephony webhook endpoint (Twilio/Asterisk)' },
            ].map(({ ready, label }) => (
              <div key={label} className="flex items-center gap-2 text-[11px]">
                <span className={ready ? 'text-emerald-400' : 'text-white/25'}>{ready ? '✅' : '⬜'}</span>
                <span className={ready ? 'text-white/60' : 'text-white/25'}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
