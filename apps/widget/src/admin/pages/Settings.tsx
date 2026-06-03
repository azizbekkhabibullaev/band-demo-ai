import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { getStats } from '../api/client.ts';

interface Stats {
  kb: { total: string; embedded: string; lang: string }[];
  faq: { total: string };
  intents: { total: string };
  sessions_7d: { total: string };
}

export function SettingsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const tenant = localStorage.getItem('admin_tenant') ?? 'ipoteka-bank';
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string) ?? '';

  useEffect(() => {
    getStats()
      .then(s => setStats(s as Stats))
      .finally(() => setLoading(false));
  }, []);

  const totalKb = stats?.kb.reduce((s, r) => s + parseInt(r.total, 10), 0) ?? 0;
  const embeddedKb = stats?.kb.reduce((s, r) => s + parseInt(r.embedded, 10), 0) ?? 0;

  function copyInfo() {
    const text = `Панель управления: ${window.location.origin}/admin\nПользователь: admin\nПароль: задаётся через ADMIN_PASSWORD на сервере`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <AdminLayout title="Настройки">
      <div className="px-6 py-5 space-y-5 max-w-3xl">
        <h2 className="text-[15px] font-semibold text-white">Настройки системы</h2>

        {/* Platform info */}
        <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wide mb-3">Платформа</h3>
          <dl className="space-y-2">
            {[
              { label: 'ID организации',   value: tenant },
              { label: 'API-сервер',        value: apiBase || '(текущий сервер)' },
              { label: 'Среда',             value: import.meta.env.MODE ?? 'production' },
              { label: 'URL панели',        value: `${window.location.origin}/admin` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
                <dt className="text-[11px] text-white/40">{label}</dt>
                <dd className="text-[12px] font-mono text-white/70 truncate max-w-xs">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Knowledge base stats */}
        <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wide mb-3">База знаний</h3>
          {loading ? (
            <div className="text-[12px] text-white/30">Загрузка…</div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Статей',    value: totalKb },
                  { label: 'Векторизировано', value: embeddedKb },
                  { label: 'FAQ',       value: parseInt(stats?.faq.total ?? '0', 10) },
                  { label: 'Намерений', value: parseInt(stats?.intents.total ?? '0', 10) },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center p-3 bg-white/[0.03] rounded-lg">
                    <div className="text-[20px] font-bold text-white">{value.toLocaleString('ru-RU')}</div>
                    <div className="text-[10px] text-white/40 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              {stats?.kb.map(r => (
                <div key={r.lang} className="flex items-center justify-between text-[12px] gap-3">
                  <span className="text-white/50 w-8">{r.lang.toUpperCase()}</span>
                  <span className="text-white/70 flex-1">
                    {parseInt(r.embedded, 10)} / {parseInt(r.total, 10)} статей векторизировано
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

        {/* Auth */}
        <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
          <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wide mb-3">Авторизация</h3>
          <p className="text-[12px] text-white/60 mb-3">
            Учётные данные администратора управляются через переменные среды на сервере Render.
          </p>
          <div className="space-y-2 text-[12px]">
            {[
              { key: 'ADMIN_USERNAME',   desc: 'Логин (по умолчанию: admin)' },
              { key: 'ADMIN_PASSWORD',   desc: 'Пароль (обязательно)' },
              { key: 'ADMIN_JWT_SECRET', desc: 'Секрет для подписи токенов (обязательно)' },
            ].map(({ key, desc }) => (
              <div key={key} className="flex items-center gap-3 p-2.5 bg-white/[0.03] rounded-lg">
                <code className="font-mono text-[11px] text-amber-400/80 w-48 shrink-0">{key}</code>
                <span className="text-white/40">{desc}</span>
              </div>
            ))}
          </div>
          <button onClick={copyInfo}
            className="mt-3 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white/[0.05] text-white/50 hover:text-white transition-all">
            {copied ? '✅ Скопировано!' : '📋 Скопировать данные для входа'}
          </button>
        </div>

        {/* Диалоговая статистика */}
        {stats && (
          <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
            <h3 className="text-[12px] font-semibold text-white/50 uppercase tracking-wide mb-3">Активность за 7 дней</h3>
            <div className="text-center">
              <div className="text-[32px] font-bold text-white">
                {parseInt(stats.sessions_7d.total, 10).toLocaleString('ru-RU')}
              </div>
              <div className="text-[12px] text-white/40 mt-1">диалогов за последние 7 дней</div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
