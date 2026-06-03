import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { getComplaints, type ComplaintStat } from '../api/client.ts';

const SEVERITY_RU: Record<string, { color: string; bg: string; label: string }> = {
  high:   { color: '#ef4444', bg: 'bg-red-500/15',    label: 'Высокий' },
  medium: { color: '#f59e0b', bg: 'bg-amber-500/15',  label: 'Средний' },
  low:    { color: '#94a3b8', bg: 'bg-slate-500/15',  label: 'Низкий' },
};

const TREND_RU: Record<string, { symbol: string; color: string; label: string }> = {
  up:     { symbol: '↑', color: '#ef4444', label: 'растёт' },
  down:   { symbol: '↓', color: '#34d399', label: 'снижается' },
  stable: { symbol: '–', color: '#94a3b8', label: 'стабильно' },
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

const CAT_RU: Record<string, string> = {
  mobile_app:      'Мобильное приложение',
  card:            'Карты',
  branch:          'Отделения',
  loan:            'Кредиты',
  deposit:         'Вклады / Депозиты',
  transfer:        'Переводы',
  otp:             'Авторизация / OTP',
  service_quality: 'Качество обслуживания',
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
  const rising = complaints.filter(c => c.trend === 'up' && c.count > 0);

  return (
    <AdminLayout title="Жалобы">
      <div className="px-6 py-5 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Анализ жалоб клиентов</h2>
            <p className="text-[12px] text-white/40 mt-0.5">
              Автоматическая классификация · {total} жалоб обнаружено
            </p>
          </div>
          <div className="flex gap-1.5">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={['px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                  days === d ? 'bg-blue-600 text-white' : 'bg-white/[0.04] text-white/50 hover:text-white'].join(' ')}>
                {d} дней
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center text-white/30 py-12 text-[13px]">Анализируем жалобы…</div>
        ) : (
          <>
            {highSeverity.length > 0 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🚨</span>
                  <h3 className="text-[13px] font-semibold text-red-300">Критичные категории требуют внимания</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {highSeverity.map(c => (
                    <span key={c.category}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-red-500/20 text-red-300 border border-red-500/20">
                      {CAT_ICONS[c.category] ?? '⚠️'} {CAT_RU[c.category] ?? c.displayName} ({c.count})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {rising.length > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 flex items-center gap-3">
                <span className="text-xl">📈</span>
                <div>
                  <p className="text-[12px] font-semibold text-orange-300">Рост жалоб</p>
                  <p className="text-[11px] text-white/50">
                    {rising.map(c => CAT_RU[c.category] ?? c.displayName).join(' · ')}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 text-center">
                <div className="text-2xl font-bold text-white">{total}</div>
                <div className="text-[11px] text-white/40 mt-1">Всего жалоб</div>
              </div>
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{highSeverity.length}</div>
                <div className="text-[11px] text-white/40 mt-1">Высокий приоритет</div>
              </div>
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 text-center">
                <div className="text-2xl font-bold text-orange-400">{rising.length}</div>
                <div className="text-[11px] text-white/40 mt-1">Растущих категорий</div>
              </div>
            </div>

            <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
              <h3 className="text-[13px] font-semibold text-white mb-4">Категории жалоб</h3>
              <div className="space-y-4">
                {complaints.map(c => {
                  const sev = SEVERITY_RU[c.severity]!;
                  const trn = TREND_RU[c.trend]!;
                  const name = CAT_RU[c.category] ?? c.displayName;
                  return (
                    <div key={c.category}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px]">{CAT_ICONS[c.category] ?? '⚠️'}</span>
                          <span className="text-[13px] font-medium text-white/80">{name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${sev.bg}`}
                            style={{ color: sev.color }}>{sev.label}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[13px] font-semibold text-white">{c.count}</span>
                          <span className="text-[11px] font-medium" style={{ color: trn.color }}>
                            {trn.symbol} {trn.label}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${(c.count / maxCount) * 100}%`, background: sev.color, opacity: c.count === 0 ? 0.15 : 0.7 }} />
                      </div>
                      <div className="text-[10px] text-white/25 mt-0.5">{c.pct}% от всех жалоб</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {total === 0 && (
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-8 text-center">
                <div className="text-3xl mb-2">✅</div>
                <p className="text-[13px] text-white/50">Жалоб за период не обнаружено</p>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
