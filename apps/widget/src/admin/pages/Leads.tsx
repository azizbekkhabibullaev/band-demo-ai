import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { getLeads, updateLeadStatus, type Lead } from '../api/client.ts';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_PIPELINE = ['new', 'contacted', 'qualified', 'converted', 'closed'] as const;
type StatusKey = typeof STATUS_PIPELINE[number];

const STATUS_META: Record<StatusKey, { color: string; bg: string; label: string; icon: string }> = {
  new:       { color: '#3b82f6', bg: 'bg-blue-500/15',    label: 'Новый',         icon: '🔵' },
  contacted: { color: '#8b5cf6', bg: 'bg-violet-500/15',  label: 'Связались',     icon: '📞' },
  qualified: { color: '#f59e0b', bg: 'bg-amber-500/15',   label: 'Квалифицирован',icon: '⭐' },
  converted: { color: '#34d399', bg: 'bg-emerald-500/15', label: 'Конвертирован', icon: '✅' },
  closed:    { color: '#94a3b8', bg: 'bg-slate-500/15',   label: 'Закрыт',        icon: '⛔' },
};

const LANG_FLAG: Record<string, string> = { uz: '🇺🇿', ru: '🇷🇺', en: '🇬🇧' };

// ─── Lead score badge ─────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  if (score >= 90) return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
      🔥 HOT {score}
    </span>
  );
  if (score >= 70) return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
      ♨️ WARM {score}
    </span>
  );
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-500/15 text-slate-400 border border-slate-500/20">
      🧊 COLD {score}
    </span>
  );
}

// ─── Time ago ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} д назад`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  async function load(status?: string) {
    setLoading(true);
    try {
      const res = await getLeads({ status: status || undefined, limit: 200 });
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

  // Pipeline counts
  const byStatus = STATUS_PIPELINE.reduce<Record<string, number>>((acc, s) => {
    acc[s] = leads.filter(l => l.status === s).length;
    return acc;
  }, { new: 0, contacted: 0, qualified: 0, converted: 0, closed: 0 });

  const hotLeads  = leads.filter(l => l.leadScore >= 90).length;
  const warmLeads = leads.filter(l => l.leadScore >= 70 && l.leadScore < 90).length;

  return (
    <AdminLayout title="Лиды">
      <div className="px-6 py-5 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Управление лидами</h2>
            <p className="text-[12px] text-white/40 mt-0.5">
              {total} лидов · {hotLeads} горячих 🔥 · {warmLeads} тёплых
            </p>
          </div>
          {/* Status filter */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilter('')}
              className={['px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                filter === '' ? 'bg-blue-600 text-white' : 'bg-white/[0.04] text-white/50 hover:text-white'].join(' ')}>
              Все
            </button>
            {STATUS_PIPELINE.map(s => {
              const m = STATUS_META[s];
              return (
                <button key={s} onClick={() => setFilter(s)}
                  className={['px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                    filter === s ? 'bg-blue-600 text-white' : 'bg-white/[0.04] text-white/50 hover:text-white'].join(' ')}>
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pipeline summary */}
        <div className="grid grid-cols-5 gap-2">
          {STATUS_PIPELINE.map(s => {
            const m = STATUS_META[s];
            const count = byStatus[s] ?? 0;
            return (
              <button key={s} onClick={() => setFilter(filter === s ? '' : s)}
                className={['bg-[#161b27] rounded-xl border transition-all p-3 text-center hover:border-white/[0.15]',
                  filter === s ? 'border-blue-500/40' : 'border-white/[0.07]'].join(' ')}>
                <div className="text-lg mb-1">{m.icon}</div>
                <div className="text-[20px] font-bold text-white">{count}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{m.label}</div>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="text-center text-white/30 py-12 text-[13px]">Загрузка лидов…</div>
        ) : leads.length === 0 ? (
          <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-8 text-center">
            <div className="text-3xl mb-2">👥</div>
            <p className="text-[13px] text-white/50">Лидов пока нет</p>
            <p className="text-[11px] text-white/30 mt-1">
              Лиды создаются, когда клиенты оставляют контакты в чате.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {leads.map(lead => {
              const sm = STATUS_META[lead.status as StatusKey] ?? STATUS_META['new'];
              return (
                <div key={lead.id}
                  className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 hover:border-white/[0.12] transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Top row: name + score + status + time */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {lead.fullName ? (
                          <span className="text-[14px] font-semibold text-white">{lead.fullName}</span>
                        ) : (
                          <span className="text-[13px] text-white/40 italic">Имя не указано</span>
                        )}
                        <ScoreBadge score={lead.leadScore} />
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${sm.bg}`}
                          style={{ color: sm.color }}>
                          {sm.icon} {sm.label}
                        </span>
                        <span className="text-[10px] text-white/30">
                          {LANG_FLAG[lead.lang]} {timeAgo(lead.createdAt)}
                        </span>
                      </div>

                      {/* Contact + product info */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-white/60">
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`}
                            className="flex items-center gap-1.5 hover:text-white transition-colors">
                            <span>📱</span>
                            <span className="font-mono">{lead.phone}</span>
                          </a>
                        ) : (
                          <span className="flex items-center gap-1.5 text-white/25">
                            <span>📱</span> Телефон не указан
                          </span>
                        )}
                        {(lead.interestType ?? lead.productInterest) && (
                          <span className="flex items-center gap-1.5">
                            <span>🎯</span> {lead.interestType ?? lead.productInterest}
                          </span>
                        )}
                        {lead.sessionId && (
                          <span className="flex items-center gap-1.5 text-white/30">
                            <span>💬</span>
                            <span className="font-mono text-[10px]">{lead.sessionId.slice(0, 8)}…</span>
                          </span>
                        )}
                      </div>

                      {lead.message && (
                        <p className="mt-2 text-[12px] text-white/50 line-clamp-2 italic bg-white/[0.02] rounded-lg px-3 py-1.5">
                          «{lead.message}»
                        </p>
                      )}
                    </div>

                    {/* Status actions */}
                    <div className="flex flex-col gap-1 shrink-0">
                      {STATUS_PIPELINE.filter(s => s !== lead.status).map(s => {
                        const m = STATUS_META[s];
                        return (
                          <button key={s}
                            onClick={() => changeStatus(lead.id, s)}
                            disabled={updating === lead.id}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all hover:opacity-80 disabled:opacity-40 whitespace-nowrap"
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
      </div>
    </AdminLayout>
  );
}
