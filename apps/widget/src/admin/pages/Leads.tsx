import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { getLeads, updateLeadStatus, type Lead } from '../api/client.ts';

const STATUS_PIPELINE = ['new', 'contacted', 'converted', 'closed'] as const;

const STATUS_META: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  new:       { color: '#3b82f6', bg: 'bg-blue-500/15',    label: 'New',       icon: '🔵' },
  contacted: { color: '#f59e0b', bg: 'bg-amber-500/15',   label: 'Contacted', icon: '📞' },
  converted: { color: '#34d399', bg: 'bg-emerald-500/15', label: 'Converted', icon: '✅' },
  closed:    { color: '#94a3b8', bg: 'bg-slate-500/15',   label: 'Closed',    icon: '⛔' },
};

const TYPE_META: Record<string, { icon: string; label: string }> = {
  callback:         { icon: '📞', label: 'Callback' },
  consultation:     { icon: '💬', label: 'Consultation' },
  escalation:       { icon: '⚠️', label: 'Escalation' },
  product_interest: { icon: '🎯', label: 'Product Interest' },
};

const FLAG: Record<string, string> = { uz: '🇺🇿', ru: '🇷🇺', en: '🇬🇧' };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  async function load(status?: string) {
    setLoading(true);
    try {
      const res = await getLeads({ status: status || undefined, limit: 100 });
      setLeads(res.leads);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(filter); }, [filter]);

  async function changeStatus(id: string, status: string) {
    setUpdating(id);
    try {
      await updateLeadStatus(id, status);
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
    } finally {
      setUpdating(null);
    }
  }

  // Group by status for pipeline view
  const byStatus = STATUS_PIPELINE.reduce<Record<string, Lead[]>>((acc, s) => {
    acc[s] = leads.filter(l => l.status === s);
    return acc;
  }, { new: [], contacted: [], converted: [], closed: [] });

  return (
    <AdminLayout title="Lead Management">
      <div className="px-6 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Lead Pipeline</h2>
            <p className="text-[12px] text-white/40 mt-0.5">
              {total} total leads · {byStatus['new']?.length ?? 0} new awaiting contact
            </p>
          </div>
          <div className="flex gap-1.5">
            {(['', ...STATUS_PIPELINE] as string[]).map(s => {
              const meta = s ? STATUS_META[s] : null;
              return (
                <button key={s} onClick={() => setFilter(s)}
                  className={['px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                    filter === s ? 'bg-blue-600 text-white' : 'bg-white/[0.04] text-white/50 hover:text-white'].join(' ')}>
                  {meta ? `${meta.icon} ${meta.label}` : 'All'}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-white/30 py-12 text-[13px]">Loading leads…</div>
        ) : (
          <>
            {/* Pipeline summary */}
            <div className="grid grid-cols-4 gap-3">
              {STATUS_PIPELINE.map(s => {
                const meta = STATUS_META[s]!;
                const count = byStatus[s]?.length ?? 0;
                return (
                  <div key={s} className="bg-[#161b27] rounded-xl border border-white/[0.07] p-3 text-center">
                    <div className="text-xl mb-1">{meta.icon}</div>
                    <div className="text-[20px] font-bold text-white">{count}</div>
                    <div className="text-[11px] text-white/40 mt-0.5">{meta.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Lead cards */}
            {leads.length === 0 ? (
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-8 text-center">
                <div className="text-3xl mb-2">📞</div>
                <p className="text-[13px] text-white/50">No leads captured yet</p>
                <p className="text-[11px] text-white/30 mt-1">
                  Leads are created when customers request callbacks or consultations in the chat.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {leads.map(lead => {
                  const statusMeta = STATUS_META[lead.status] ?? STATUS_META['new']!;
                  const typeMeta = TYPE_META[lead.leadType] ?? { icon: '📋', label: lead.leadType };
                  return (
                    <div key={lead.id}
                      className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 hover:border-white/[0.12] transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[13px]">{typeMeta.icon}</span>
                            <span className="text-[13px] font-semibold text-white">{typeMeta.label}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusMeta.bg}`}
                              style={{ color: statusMeta.color }}>
                              {statusMeta.label}
                            </span>
                            <span className="text-[10px] text-white/30">{FLAG[lead.lang]} {timeAgo(lead.createdAt)}</span>
                          </div>

                          <div className="flex flex-wrap gap-3 text-[12px] text-white/60">
                            {lead.phone && (
                              <span className="flex items-center gap-1">
                                <span className="text-white/30">📱</span> {lead.phone}
                              </span>
                            )}
                            {lead.productInterest && (
                              <span className="flex items-center gap-1">
                                <span className="text-white/30">🎯</span> {lead.productInterest}
                              </span>
                            )}
                            {lead.intentName && (
                              <span className="flex items-center gap-1">
                                <span className="text-white/30">🔖</span> {lead.intentName}
                              </span>
                            )}
                          </div>

                          {lead.message && (
                            <p className="mt-2 text-[12px] text-white/50 line-clamp-2 italic">
                              "{lead.message}"
                            </p>
                          )}
                        </div>

                        {/* Status actions */}
                        <div className="flex flex-col gap-1 shrink-0">
                          {STATUS_PIPELINE.filter(s => s !== lead.status).map(s => {
                            const m = STATUS_META[s]!;
                            return (
                              <button key={s}
                                onClick={() => changeStatus(lead.id, s)}
                                disabled={updating === lead.id}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all hover:opacity-80 disabled:opacity-40"
                                style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}33` }}>
                                → {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
