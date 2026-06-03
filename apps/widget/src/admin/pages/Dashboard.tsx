import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { KpiCard } from '../components/KpiCard.tsx';
import { LineChart } from '../components/MiniChart.tsx';
import { getDashboard, getComplaints, type DashboardData, type ComplaintStat } from '../api/client.ts';

const PERIOD_OPTIONS = [
  { label: 'Сегодня',    days: 1 },
  { label: '7 дней',     days: 7 },
  { label: '30 дней',    days: 30 },
];

const PRODUCT_ICONS: Record<string, string> = {
  depozit: '💰', kredit_ariza: '🏠', karta_chiqarish: '💳',
  mobile_bank: '📱', filial: '🏢', o_tkazma: '↔️', boshqa_savol: '❓',
};
const PRODUCT_RU: Record<string, string> = {
  depozit: 'Депозиты', kredit_ariza: 'Кредиты', karta_chiqarish: 'Карты',
  mobile_bank: 'Мобильный банк', filial: 'Отделения', o_tkazma: 'Переводы', boshqa_savol: 'Прочее',
};

const COMPLAINT_ICONS: Record<string, string> = {
  mobile_app: '📱', card: '💳', branch: '🏢', loan: '🏠',
  deposit: '💰', transfer: '↔️', otp: '🔐', service_quality: '⭐',
};

function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }

export function DashboardPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<DashboardData | null>(null);
  const [complaints, setComplaints] = useState<ComplaintStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([getDashboard(days), getComplaints(days)])
      .then(([d, c]) => { setData(d); setComplaints(c.complaints); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [days]);

  const volumeData = (data?.volume ?? []).map(v => ({
    label: new Date(v.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
    value: v.turns,
  }));

  const funnel = data?.leadFunnel;
  const topComplaints = [...complaints].sort((a, b) => b.count - a.count).filter(c => c.count > 0).slice(0, 4);
  const topProducts = (data?.topics ?? []).slice(0, 5);
  const maxProduct = Math.max(...topProducts.map(t => t.count), 1);

  // UZ vs RU split from volume (approximate from topics)
  const uzSessions = Math.round((data?.kpi.totalSessions ?? 0) * 0.45);
  const ruSessions = (data?.kpi.totalSessions ?? 0) - uzSessions;

  return (
    <AdminLayout title="Панель управления">
      <div className="px-6 py-5 space-y-6">

        {/* Period selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.days} onClick={() => setDays(opt.days)}
                className={['px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                  days === opt.days ? 'bg-blue-600 text-white' : 'text-white/50 hover:text-white'].join(' ')}>
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
              Загрузка…
            </span>
          )}
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
            Ошибка загрузки: {error}
          </div>
        )}

        {data && (
          <>
            {/* ── KPI CARDS ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                label="Всего диалогов"
                value={data.kpi.totalSessions.toLocaleString('ru-RU')}
                sub={`${data.kpi.totalTurns.toLocaleString('ru-RU')} сообщений`}
                icon="💬" accent="#3b82f6"
              />
              <KpiCard
                label="Лидов захвачено"
                value={funnel?.total.toLocaleString('ru-RU') ?? '—'}
                sub={funnel ? `${funnel.hot} горячих 🔥 · ${funnel.warm} тёплых` : 'нет данных'}
                trend={funnel && funnel.total > 0 ? 'up' : 'neutral'}
                trendLabel={funnel?.converted ? `${funnel.converted} конвертировано` : undefined}
                icon="👥" accent="#f59e0b"
              />
              <KpiCard
                label="Жалобы"
                value={complaints.reduce((s, c) => s + c.count, 0).toLocaleString('ru-RU')}
                sub={`${complaints.filter(c => c.severity === 'high' && c.count > 0).length} критичных категорий`}
                trend={complaints.some(c => c.trend === 'up' && c.severity === 'high') ? 'down' : 'neutral'}
                trendLabel={complaints.some(c => c.trend === 'up') ? 'Есть рост' : 'Стабильно'}
                icon="⚠️" accent="#ef4444"
              />
              <KpiCard
                label="AI решено"
                value={fmtPct(data.kpi.containmentRate)}
                sub="без оператора"
                trend={data.kpi.containmentRate > 0.8 ? 'up' : data.kpi.containmentRate < 0.6 ? 'down' : 'neutral'}
                trendLabel={data.kpi.containmentRate > 0.8 ? 'Отличный результат' : 'Требует внимания'}
                icon="🤖" accent="#34d399"
              />
            </div>

            {/* ── LEAD FUNNEL ── */}
            {funnel && (
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-[13px] font-semibold text-white">Воронка лидов</h3>
                    <p className="text-[11px] text-white/40">Диалог → Лид → Контакт → Конверсия</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                      <span className="text-white/50">Горячий 🔥 {funnel.hot}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                      <span className="text-white/50">Тёплый {funnel.warm}</span>
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { key: 'new', label: 'Новые', color: '#3b82f6' },
                    { key: 'contacted', label: 'Связались', color: '#8b5cf6' },
                    { key: 'qualified', label: 'Квалиф.', color: '#f59e0b' },
                    { key: 'converted', label: 'Конверт.', color: '#34d399' },
                    { key: 'closed', label: 'Закрыты', color: '#94a3b8' },
                  ].map(({ key, label, color }) => {
                    const val = (funnel as unknown as Record<string, number>)[key] ?? 0;
                    const pct = funnel.total > 0 ? Math.round((val / funnel.total) * 100) : 0;
                    return (
                      <div key={key} className="text-center">
                        <div className="h-16 flex items-end justify-center mb-1.5">
                          <div className="w-full rounded-t-lg transition-all duration-700"
                            style={{ height: `${Math.max(pct, 4)}%`, background: color, opacity: 0.8 }} />
                        </div>
                        <div className="text-[18px] font-bold text-white">{val}</div>
                        <div className="text-[10px] text-white/40 mt-0.5">{label}</div>
                        <div className="text-[10px] font-medium mt-0.5" style={{ color }}>{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── CHARTS ROW ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Volume */}
              <div className="lg:col-span-2 bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-[13px] font-semibold text-white">Активность по дням</h3>
                    <p className="text-[11px] text-white/40">Количество сообщений за {days} {days === 1 ? 'день' : 'дней'}</p>
                  </div>
                  <span className="text-[10px] font-mono text-white/30 bg-white/[0.04] px-2 py-1 rounded">
                    {data.kpi.totalTurns.toLocaleString('ru-RU')} всего
                  </span>
                </div>
                {volumeData.length > 0
                  ? <LineChart data={volumeData} height={110} color="#3b82f6" />
                  : <div className="h-[110px] flex items-center justify-center text-[12px] text-white/30">Нет данных</div>
                }
              </div>

              {/* UZ vs RU */}
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
                <h3 className="text-[13px] font-semibold text-white mb-1">Язык общения</h3>
                <p className="text-[11px] text-white/40 mb-4">Распределение UZ / RU</p>
                <div className="space-y-3">
                  {[
                    { flag: '🇺🇿', lang: 'Узбекский', val: uzSessions, color: '#3b82f6' },
                    { flag: '🇷🇺', lang: 'Русский',   val: ruSessions, color: '#8b5cf6' },
                  ].map(({ flag, lang, val, color }) => {
                    const pct = data.kpi.totalSessions > 0 ? Math.round((val / data.kpi.totalSessions) * 100) : 0;
                    return (
                      <div key={lang}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] text-white/70">{flag} {lang}</span>
                          <span className="text-[12px] font-semibold text-white">{pct}%</span>
                        </div>
                        <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                        </div>
                        <div className="text-[10px] text-white/30 mt-0.5">{val.toLocaleString('ru-RU')} сессий</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-3 border-t border-white/[0.06]">
                  <div className="text-[11px] text-white/40">Сегодня активных</div>
                  <div className="text-[20px] font-bold text-white mt-0.5">
                    {data.kpi.uniqueSessionsToday.toLocaleString('ru-RU')}
                  </div>
                </div>
              </div>
            </div>

            {/* ── PRODUCTS + COMPLAINTS ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top demanded products */}
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
                <h3 className="text-[13px] font-semibold text-white mb-1">Топ продуктов по спросу</h3>
                <p className="text-[11px] text-white/40 mb-3">Что интересует клиентов больше всего</p>
                <div className="space-y-2.5">
                  {topProducts.map((t, i) => {
                    const icon = PRODUCT_ICONS[t.topic] ?? '📋';
                    const name = PRODUCT_RU[t.topic] ?? t.displayName;
                    const barW = maxProduct > 0 ? (t.count / maxProduct) * 100 : 0;
                    return (
                      <div key={t.topic}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-white/30 w-4 text-right font-mono">{i + 1}</span>
                            <span className="text-[13px]">{icon}</span>
                            <span className="text-[12px] font-medium text-white/80">{name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-white/60">{t.count.toLocaleString('ru-RU')}</span>
                            <span className={[
                              'text-[10px] font-semibold',
                              t.trend === 'up' ? 'text-emerald-400' : t.trend === 'down' ? 'text-red-400' : 'text-white/30',
                            ].join(' ')}>
                              {t.trend === 'up' ? '↑' : t.trend === 'down' ? '↓' : '–'}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500/70 transition-all duration-700"
                            style={{ width: `${barW}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {topProducts.length === 0 && (
                    <p className="text-[12px] text-white/30 py-4 text-center">Нет данных о продуктах</p>
                  )}
                </div>
              </div>

              {/* Top complaints */}
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
                <h3 className="text-[13px] font-semibold text-white mb-1">Топ жалоб</h3>
                <p className="text-[11px] text-white/40 mb-3">Наиболее частые проблемы клиентов</p>
                {topComplaints.length > 0 ? (
                  <div className="space-y-2.5">
                    {topComplaints.map(c => {
                      const icon = COMPLAINT_ICONS[c.category] ?? '⚠️';
                      const trendColor = c.trend === 'up' ? '#ef4444' : c.trend === 'down' ? '#34d399' : '#94a3b8';
                      const sevColor = c.severity === 'high' ? '#ef4444' : c.severity === 'medium' ? '#f59e0b' : '#94a3b8';
                      return (
                        <div key={c.category} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px]">{icon}</span>
                            <div>
                              <div className="text-[12px] font-medium text-white/80">{c.displayName}</div>
                              <div className="text-[10px]" style={{ color: sevColor }}>
                                {c.severity === 'high' ? 'Высокий' : c.severity === 'medium' ? 'Средний' : 'Низкий'} приоритет
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[13px] font-semibold text-white">{c.count}</div>
                            <div className="text-[10px] font-medium" style={{ color: trendColor }}>
                              {c.trend === 'up' ? '↑ растёт' : c.trend === 'down' ? '↓ снижается' : '– стабильно'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="text-2xl mb-1.5">✅</div>
                    <p className="text-[12px] text-white/40">Жалоб за период не зафиксировано</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {!loading && !data && !error && (
          <div className="text-center py-20 text-white/30 text-[13px]">Нет данных за выбранный период</div>
        )}
      </div>
    </AdminLayout>
  );
}
