import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { getEscalations, patchEscalation, type Escalation } from '../api/client.ts';

const SEV_META: Record<string, { color: string; bg: string; emoji: string }> = {
  critical: { color: '#ef4444', bg: 'bg-red-500/15',    emoji: '🔴' },
  high:     { color: '#f97316', bg: 'bg-orange-500/15', emoji: '🟠' },
  medium:   { color: '#f59e0b', bg: 'bg-amber-500/15',  emoji: '🟡' },
  low:      { color: '#94a3b8', bg: 'bg-slate-500/15',  emoji: '⚪' },
};

const STATUS_META: Record<string, { color: string; label: string }> = {
  open:         { color: '#ef4444', label: 'OPEN' },
  under_review: { color: '#f59e0b', label: 'UNDER REVIEW' },
  resolved:     { color: '#34d399', label: 'RESOLVED' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function EscalationsPage() {
  const [filter, setFilter] = useState('');
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    getEscalations(filter || undefined)
      .then(r => setEscalations(r.escalations))
      .finally(() => setLoading(false));
  }, [filter]);

  async function changeStatus(id: string, status: string) {
    setUpdating(id);
    try {
      await patchEscalation(id, status, notes[id]);
      setEscalations(prev => prev.map(e => e.id === id ? { ...e, status: status as Escalation['status'] } : e));
    } finally {
      setUpdating(null);
    }
  }

  const byStatus = {
    open: escalations.filter(e => e.status === 'open').length,
    under_review: escalations.filter(e => e.status === 'under_review').length,
    resolved: escalations.filter(e => e.status === 'resolved').length,
  };

  return (
    <AdminLayout title="Escalations">
      <div className="px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Escalation Management</h2>
            <p className="text-[12px] text-white/40 mt-0.5">
              Auto-detected incidents and manually created escalations
            </p>
          </div>
          <div className="flex gap-1.5">
            {[
              { v: '',             label: 'All' },
              { v: 'open',         label: '🔴 Open' },
              { v: 'under_review', label: '🟡 Review' },
              { v: 'resolved',     label: '✅ Resolved' },
            ].map(({ v, label }) => (
              <button key={v} onClick={() => setFilter(v)}
                className={['px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                  filter === v ? 'bg-blue-600 text-white' : 'bg-white/[0.04] text-white/50 hover:text-white'].join(' ')}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Status summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: 'open',         label: 'Open',        color: '#ef4444' },
            { key: 'under_review', label: 'Under Review', color: '#f59e0b' },
            { key: 'resolved',     label: 'Resolved',    color: '#34d399' },
          ].map(({ key, label, color }) => (
            <div key={key} className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 text-center cursor-pointer"
              onClick={() => setFilter(key)}>
              <div className="text-[22px] font-bold text-white" style={{ color }}>
                {byStatus[key as keyof typeof byStatus]}
              </div>
              <div className="text-[11px] text-white/40 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-white/30 py-12 text-[13px]">Loading escalations…</div>
        ) : escalations.length === 0 ? (
          <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-8 text-center">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-[13px] text-white/50">
              {filter ? `No ${filter.replace('_', ' ')} escalations` : 'No escalations found'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {escalations.map(esc => {
              const sev = SEV_META[esc.severity] ?? SEV_META['medium']!;
              const stat = STATUS_META[esc.status] ?? STATUS_META['open']!;
              return (
                <div key={esc.id}
                  className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 hover:border-white/[0.12] transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-[20px] mt-0.5">{sev.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-[13px] font-semibold text-white">{esc.title}</h3>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide"
                              style={{ background: `${stat.color}22`, color: stat.color }}>
                              {stat.label}
                            </span>
                            {esc.autoDetected && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-purple-500/15 text-purple-400">
                                auto-detected
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/40">
                            <span>{esc.category}</span>
                            <span>·</span>
                            <span>{esc.triggerCount} triggers</span>
                            <span>·</span>
                            <span>{timeAgo(esc.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <p className="text-[12px] text-white/60 mb-3">{esc.description}</p>

                      {/* Notes input */}
                      <div className="flex items-center gap-2">
                        <input
                          value={notes[esc.id] ?? ''}
                          onChange={e => setNotes(prev => ({ ...prev, [esc.id]: e.target.value }))}
                          placeholder="Add notes (optional)…"
                          className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]
                            text-[11px] text-white placeholder-white/20 outline-none focus:border-blue-500/30"
                        />
                        {/* Status actions */}
                        {esc.status === 'open' && (
                          <>
                            <button onClick={() => changeStatus(esc.id, 'under_review')}
                              disabled={updating === esc.id}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 disabled:opacity-40 transition-all">
                              → Review
                            </button>
                            <button onClick={() => changeStatus(esc.id, 'resolved')}
                              disabled={updating === esc.id}
                              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-40 transition-all">
                              ✓ Resolve
                            </button>
                          </>
                        )}
                        {esc.status === 'under_review' && (
                          <button onClick={() => changeStatus(esc.id, 'resolved')}
                            disabled={updating === esc.id}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-40 transition-all">
                            ✓ Resolve
                          </button>
                        )}
                        {esc.status === 'resolved' && (
                          <button onClick={() => changeStatus(esc.id, 'open')}
                            disabled={updating === esc.id}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-40 transition-all">
                            Reopen
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
