import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../components/Layout.tsx';
import { getLeads, updateLeadStatus, getLeadTimeline, type Lead, type LeadTimelineEntry } from '../api/client.ts';

// ─── Status pipeline ──────────────────────────────────────────────────────────

const STATUS_PIPELINE = ['new', 'contacted', 'qualified', 'converted', 'closed'] as const;
type StatusKey = typeof STATUS_PIPELINE[number];

const STATUS_META: Record<StatusKey, { color: string; bg: string; label: string; icon: string }> = {
  new:       { color: '#3b82f6', bg: 'bg-blue-500/15',    label: 'Новый',          icon: '🔵' },
  contacted: { color: '#8b5cf6', bg: 'bg-violet-500/15',  label: 'Связались',      icon: '📞' },
  qualified: { color: '#f59e0b', bg: 'bg-amber-500/15',   label: 'Квалифицирован', icon: '⭐' },
  converted: { color: '#34d399', bg: 'bg-emerald-500/15', label: 'Конвертирован',  icon: '✅' },
  closed:    { color: '#94a3b8', bg: 'bg-slate-500/15',   label: 'Закрыт',         icon: '⛔' },
};

// Pipeline-aware: what transitions are allowed from each status
const NEXT_STATUSES: Record<StatusKey, StatusKey[]> = {
  new:       ['contacted', 'closed'],
  contacted: ['qualified', 'closed'],
  qualified: ['converted', 'closed'],
  converted: [],
  closed:    [],
};

const TOAST_MESSAGES: Record<StatusKey, string> = {
  contacted: 'Лид переведён в статус «Связались»',
  qualified: 'Лид успешно квалифицирован ⭐',
  converted: 'Лид успешно конвертирован ✅',
  closed:    'Лид закрыт',
  new:       '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LANG_FLAG: Record<string, string> = { uz: '🇺🇿', ru: '🇷🇺', en: '🇬🇧' };

function timeAgo(iso: string | Date): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} д назад`;
}

function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Score badge ──────────────────────────────────────────────────────────────

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

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  msg: string;
  type: 'success' | 'error';
}

function Toaster({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={[
            'px-4 py-3 rounded-xl text-[13px] font-medium shadow-xl animate-in slide-in-from-bottom-2 duration-300',
            t.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white',
          ].join(' ')}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ─── Timeline component ───────────────────────────────────────────────────────

function Timeline({ entries }: { entries: LeadTimelineEntry[] }) {
  return (
    <div className="mt-3 pt-3 border-t border-white/[0.05]">
      <p className="text-[10px] text-white/30 uppercase tracking-wide font-semibold mb-2">История</p>
      <div className="space-y-1.5">
        {entries.map((entry, i) => {
          const sm = STATUS_META[entry.toStatus as StatusKey];
          const isFirst = entry.fromStatus === null;
          return (
            <div key={entry.id} className="flex items-start gap-2.5">
              <div className="flex flex-col items-center shrink-0 mt-0.5">
                <div className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: sm?.color ?? '#94a3b8' }} />
                {i < entries.length - 1 && (
                  <div className="w-px flex-1 mt-1 bg-white/[0.06]" style={{ minHeight: '14px' }} />
                )}
              </div>
              <div className="pb-1.5">
                <p className="text-[11px] text-white/70 leading-tight">
                  {isFirst
                    ? 'Лид создан'
                    : `${STATUS_META[entry.fromStatus as StatusKey]?.icon ?? ''} → ${sm?.icon ?? ''} ${sm?.label ?? entry.toStatus}`}
                </p>
                <p className="text-[10px] text-white/30 mt-0.5">{fmtDate(entry.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Lead card ────────────────────────────────────────────────────────────────

interface LeadCardProps {
  lead: Lead;
  updating: boolean;
  onStatusChange: (id: string, status: string) => void;
  onOpenConversation: (sessionId: string) => void;
}

function LeadCard({ lead, updating, onStatusChange, onOpenConversation }: LeadCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [timeline, setTimeline] = useState<LeadTimelineEntry[] | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const sm = STATUS_META[lead.status as StatusKey] ?? STATUS_META['new'];
  const nextStatuses = NEXT_STATUSES[lead.status as StatusKey] ?? [];
  const isTerminal = lead.status === 'converted' || lead.status === 'closed';

  async function handleExpand() {
    const nowExpanded = !expanded;
    setExpanded(nowExpanded);
    if (nowExpanded && timeline === null) {
      setLoadingTimeline(true);
      try {
        const entries = await getLeadTimeline(lead.id);
        setTimeline(entries);
      } catch {
        setTimeline([]);
      } finally {
        setLoadingTimeline(false);
      }
    }
  }

  return (
    <div className="bg-[#161b27] rounded-xl border border-white/[0.07] hover:border-white/[0.13] transition-colors">
      {/* ── Main row ── */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">

            {/* Name + score + status + time */}
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
                {LANG_FLAG[lead.lang] ?? '🌐'} {timeAgo(lead.createdAt)}
              </span>
            </div>

            {/* Contact + product */}
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
                <button
                  onClick={() => onOpenConversation(lead.sessionId!)}
                  className="flex items-center gap-1.5 text-blue-400/70 hover:text-blue-300 transition-colors">
                  <span>💬</span>
                  <span className="font-mono text-[10px]">Открыть диалог</span>
                </button>
              )}
            </div>

            {lead.message && (
              <p className="mt-2 text-[12px] text-white/50 line-clamp-2 italic bg-white/[0.02] rounded-lg px-3 py-1.5">
                «{lead.message}»
              </p>
            )}
          </div>

          {/* ── Status actions ── */}
          <div className="flex flex-col gap-1 shrink-0 items-end">
            {isTerminal ? (
              <div className={`text-[11px] font-medium px-3 py-1.5 rounded-lg ${sm.bg}`}
                style={{ color: sm.color }}>
                {lead.status === 'converted' ? '✅ Сделка завершена' : '❌ Лид закрыт'}
              </div>
            ) : (
              nextStatuses.map(s => {
                const m = STATUS_META[s];
                return (
                  <button key={s}
                    onClick={() => onStatusChange(lead.id, s)}
                    disabled={updating}
                    title={`Перевести в "${m.label}"`}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all
                      hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed
                      active:scale-[0.97] whitespace-nowrap"
                    style={{
                      background: `${m.color}20`,
                      color: m.color,
                      border: `1px solid ${m.color}40`,
                    }}>
                    {updating ? '…' : `→ ${m.label}`}
                  </button>
                );
              })
            )}

            {/* Expand for timeline */}
            <button
              onClick={handleExpand}
              className="mt-1 text-[10px] text-white/30 hover:text-white/60 transition-colors px-1">
              {expanded ? '▲ Скрыть' : '▼ История'}
            </button>
          </div>
        </div>

        {/* ── Timeline ── */}
        {expanded && (
          loadingTimeline ? (
            <p className="text-[11px] text-white/30 mt-3 pt-3 border-t border-white/[0.05]">Загрузка истории…</p>
          ) : (
            <Timeline entries={timeline ?? []} />
          )
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function LeadsPage() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  let toastCounter = 0;

  function addToast(msg: string, type: 'success' | 'error' = 'success') {
    const id = ++toastCounter;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }

  const load = useCallback(async (status?: string) => {
    setLoading(true);
    try {
      const res = await getLeads({ status: status || undefined, limit: 200 });
      setLeads(res.leads);
      setTotal(res.total);
    } catch (e) {
      addToast(`Ошибка загрузки: ${String(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(filter); }, [filter, load]);

  async function changeStatus(id: string, status: string) {
    if (updatingId) return;
    setUpdatingId(id);
    try {
      await updateLeadStatus(id, status);
      // Optimistic UI update
      setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
      addToast(TOAST_MESSAGES[status as StatusKey] || `Статус обновлён: ${status}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast(`Ошибка: ${msg}`, 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  function openConversation(sessionId: string) {
    navigate('/admin/conversations', { state: { sessionId } });
  }

  // Pipeline summary counts
  const byStatus = STATUS_PIPELINE.reduce<Record<string, number>>((acc, s) => {
    acc[s] = leads.filter(l => l.status === s).length;
    return acc;
  }, { new: 0, contacted: 0, qualified: 0, converted: 0, closed: 0 });

  const hotLeads  = leads.filter(l => l.leadScore >= 90).length;
  const warmLeads = leads.filter(l => l.leadScore >= 70 && l.leadScore < 90).length;
  const conversionPct = byStatus['new']
    ? Math.round(((byStatus['converted'] ?? 0) / (total || 1)) * 100)
    : 0;

  return (
    <AdminLayout title="Лиды">
      <div className="px-6 py-5 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Управление лидами</h2>
            <p className="text-[12px] text-white/40 mt-0.5">
              {total} лидов · {hotLeads} горячих 🔥 · {warmLeads} тёплых ·{' '}
              <span className="text-emerald-400">{conversionPct}% конверсия</span>
            </p>
          </div>
          {/* Filter buttons */}
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

        {/* Pipeline bar */}
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

        {/* Conversion metric */}
        {total > 0 && (
          <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
            <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wide mb-3">Воронка конверсии</h3>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {STATUS_PIPELINE.map((s, i) => {
                const count = byStatus[s] ?? 0;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                const m = STATUS_META[s];
                return (
                  <div key={s} className="flex items-center gap-2 shrink-0">
                    <div className="text-center">
                      <div className="text-[18px] font-bold text-white">{count}</div>
                      <div className="text-[9px] text-white/40">{m.label}</div>
                      <div className="text-[9px] text-white/25">{pct}%</div>
                    </div>
                    {i < STATUS_PIPELINE.length - 1 && (
                      <span className="text-white/20 text-[16px]">→</span>
                    )}
                  </div>
                );
              })}
              <div className="ml-4 shrink-0 text-center">
                <div className="text-[18px] font-bold text-emerald-400">{conversionPct}%</div>
                <div className="text-[9px] text-white/40">конверсия</div>
              </div>
            </div>
          </div>
        )}

        {/* Lead list */}
        {loading ? (
          <div className="text-center text-white/30 py-12 text-[13px]">Загрузка лидов…</div>
        ) : leads.length === 0 ? (
          <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-8 text-center">
            <div className="text-3xl mb-2">👥</div>
            <p className="text-[13px] text-white/50">
              {filter ? `Нет лидов со статусом «${STATUS_META[filter as StatusKey]?.label ?? filter}»` : 'Лидов пока нет'}
            </p>
            <p className="text-[11px] text-white/30 mt-1">
              Лиды создаются, когда клиенты оставляют контакты в чате.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {leads.map(lead => (
              <LeadCard
                key={lead.id}
                lead={lead}
                updating={updatingId === lead.id}
                onStatusChange={changeStatus}
                onOpenConversation={openConversation}
              />
            ))}
          </div>
        )}
      </div>

      <Toaster toasts={toasts} />
    </AdminLayout>
  );
}
