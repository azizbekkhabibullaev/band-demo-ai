/**
 * VOC Analytics — Аналитика звонков
 * Main admin page: KPI dashboard + upload zone + call list + topics/trends
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../components/Layout.tsx';
import {
  uploadCalls,
  getCallsAnalytics,
  getCallsTrends,
  getCallsTopics,
  getCalls,
  deleteCall,
  type CallRecord,
  type CallAnalytics,
  type CallTrend,
  type CallTopics,
} from '../api/callsClient.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const SENTIMENT_CFG = {
  positive: { label: 'Позитивный', color: '#34d399', bg: 'bg-emerald-500/15', icon: '😊' },
  neutral:  { label: 'Нейтральный', color: '#94a3b8', bg: 'bg-slate-500/15',  icon: '😐' },
  negative: { label: 'Негативный',  color: '#ef4444', bg: 'bg-red-500/15',    icon: '😠' },
} as const;

const PRIORITY_CFG = {
  low:      { label: 'Низкий',     color: '#64748b', bg: 'bg-slate-600/20' },
  medium:   { label: 'Средний',    color: '#f59e0b', bg: 'bg-amber-500/20' },
  high:     { label: 'Высокий',    color: '#f97316', bg: 'bg-orange-500/20' },
  critical: { label: 'Критичный',  color: '#ef4444', bg: 'bg-red-500/20' },
} as const;

const STATUS_CFG = {
  pending:    { label: 'В очереди',    color: '#94a3b8', dot: 'bg-slate-400' },
  processing: { label: 'Обработка…',  color: '#3b82f6', dot: 'bg-blue-400 animate-pulse' },
  completed:  { label: 'Готово',       color: '#34d399', dot: 'bg-emerald-400' },
  failed:     { label: 'Ошибка',       color: '#ef4444', dot: 'bg-red-400' },
} as const;

const CAT_ICONS: Record<string, string> = {
  'Вклады': '💰', 'Кредиты': '🏦', 'Автокредиты': '🚗', 'Ипотека': '🏠',
  'Карты': '💳', 'Мобильное приложение': '📱', 'Филиалы': '🏢',
  'Поддержка': '🎧', 'Брокерские услуги': '📈', 'Жалобы': '⚠️', 'Другое': '📋',
};

function fmtDuration(secs: number): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? `${m}мин ${s}с` : `${s}с`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiBox({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4 flex flex-col gap-1">
      <div className="text-[11px] text-white/40 font-medium uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold" style={{ color: accent ?? '#fff' }}>{value}</div>
      {sub && <div className="text-[10px] text-white/30">{sub}</div>}
    </div>
  );
}

// ─── Language options ─────────────────────────────────────────────────────────

type UploadLanguage = 'uz' | 'ru' | 'auto';

const LANG_OPTIONS: { value: UploadLanguage; flag: string; label: string; hint: string }[] = [
  {
    value: 'uz',
    flag:  '🇺🇿',
    label: "O'zbekcha",
    hint:  "Whisper avtomatik aniqlab, o'zbek normallovchi ishlatiladi",
  },
  {
    value: 'ru',
    flag:  '🇷🇺',
    label: 'Русский',
    hint:  'Whisper принудительно переводит на русский язык',
  },
  {
    value: 'auto',
    flag:  '🔍',
    label: 'Авто-определение',
    hint:  'Whisper автоматически определяет язык',
  },
];

// ─── Upload drop zone ─────────────────────────────────────────────────────────

function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [language, setLanguage]     = useState<UploadLanguage>('auto');
  const [uploadResult, setUploadResult] = useState<{ count: number; names: string[] } | null>(null);
  const [uploadError, setUploadError]   = useState('');

  const ACCEPT = '.mp3,.wav,.m4a,.webm,.mp4,.ogg,.flac';

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setUploading(true);
    setUploadError('');
    setUploadResult(null);
    try {
      const res = await uploadCalls(arr, language);
      setUploadResult({ count: res.count, names: res.uploaded.map(u => u.filename) });
      onUploaded();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  }

  const selectedLang = LANG_OPTIONS.find(l => l.value === language)!;

  return (
    <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📤</span>
        <h3 className="text-[13px] font-semibold text-white">Загрузить звонок</h3>
        <span className="ml-auto text-[10px] text-white/25">MP3 · WAV · M4A · до 50 МБ</span>
      </div>

      {/* ── Language selector — critical for Uzbek quality ── */}
      <div className="mb-3">
        <div className="text-[10px] text-white/40 uppercase tracking-wide mb-1.5 font-medium">
          Язык записи
          <span className="ml-1.5 text-orange-400/70 normal-case font-normal">
            ⚠️ Выберите правильно — влияет на качество транскрипции
          </span>
        </div>
        <div className="flex gap-1.5">
          {LANG_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setLanguage(opt.value)}
              className={[
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all flex-1 justify-center',
                language === opt.value
                  ? opt.value === 'uz'
                    ? 'bg-emerald-600/30 border border-emerald-500/50 text-emerald-300'
                    : opt.value === 'ru'
                      ? 'bg-blue-600/30 border border-blue-500/50 text-blue-300'
                      : 'bg-white/10 border border-white/20 text-white'
                  : 'bg-white/[0.03] border border-white/[0.07] text-white/40 hover:text-white/70 hover:bg-white/[0.06]',
              ].join(' ')}
            >
              <span>{opt.flag}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
        {/* Hint for selected language */}
        <p className="text-[10px] text-white/25 mt-1.5 leading-relaxed">
          {selectedLang.hint}
        </p>
        {/* Special Uzbek warning */}
        {language === 'uz' && (
          <div className="mt-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <p className="text-[11px] text-emerald-300 font-medium">
              ✓ O'zbek tili tanlandi
            </p>
            <p className="text-[10px] text-white/40 mt-0.5">
              Whisper language=uz + GPT normalizatsiya qadami yoqilgan.
              Transkript adabiy o'zbek tilida saqlanadi.
            </p>
          </div>
        )}
        {language === 'auto' && (
          <div className="mt-2 px-3 py-2 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <p className="text-[11px] text-orange-300 font-medium">
              ⚠️ Авто-определение не рекомендуется для узбекских звонков
            </p>
            <p className="text-[10px] text-white/40 mt-0.5">
              Whisper часто транскрибирует узбекский как фонетическую латиницу.
              Выберите 🇺🇿 O'zbekcha для правильного результата.
            </p>
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        className={[
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200',
          dragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-white/[0.12] hover:border-white/25 hover:bg-white/[0.02]',
          uploading ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        {uploading ? (
          <div className="space-y-2">
            <div className="text-3xl animate-bounce">⏳</div>
            <p className="text-[13px] text-white/60">
              {language === 'uz'
                ? "Whisper → O'zbek normalizatsiyasi → GPT tahlili…"
                : 'Транскрибируем и анализируем…'}
            </p>
            <p className="text-[11px] text-white/30">Это может занять 30–90 секунд</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-3xl">{selectedLang.flag}</div>
            <p className="text-[13px] font-medium text-white/70">
              Перетащите файлы сюда или{' '}
              <span className="text-blue-400">выберите файл</span>
            </p>
            <p className="text-[11px] text-white/30">
              Язык: <span className="text-white/50">{selectedLang.flag} {selectedLang.label}</span>
              {' · '}Несколько файлов поддерживается
            </p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={e => { void handleFiles(e.target.files); e.target.value = ''; }}
      />

      {uploadResult && (
        <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <p className="text-[12px] font-medium text-emerald-400">
            ✓ Загружено {uploadResult.count} файл(ов) — анализ запущен в фоне
          </p>
          <p className="text-[10px] text-white/30 mt-0.5">
            {uploadResult.names.join(', ')}
          </p>
        </div>
      )}

      {uploadError && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-[12px] text-red-400">⚠️ {uploadError}</p>
        </div>
      )}
    </div>
  );
}

// ─── Trend badge ──────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: CallTrend }) {
  const isUp = trend.direction === 'up';
  const isDown = trend.direction === 'down';
  const isNeg = trend.isAnomaly && isUp && trend.category.toLowerCase().includes('жалоб');
  const color = isNeg ? '#ef4444' : isUp ? '#34d399' : isDown ? '#94a3b8' : '#64748b';
  const arrow = isUp ? '↑' : isDown ? '↓' : '–';
  const icon = CAT_ICONS[trend.category] ?? '📋';

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.05] last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-[15px]">{icon}</span>
        <span className="text-[12px] text-white/70">{trend.category}</span>
        {trend.isAnomaly && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-orange-500/20 text-orange-300">АНОМАЛИЯ</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-white/30">{trend.previous} → {trend.current}</span>
        <span className="text-[13px] font-semibold" style={{ color }}>
          {arrow} {Math.abs(trend.changePct)}%
        </span>
      </div>
    </div>
  );
}

// ─── Call row ─────────────────────────────────────────────────────────────────

function CallRow({ call, onDelete, onClick }: {
  call: CallRecord;
  onDelete: (id: string) => void;
  onClick: (id: string) => void;
}) {
  const st = STATUS_CFG[call.status] ?? STATUS_CFG.pending;
  const sent = call.sentiment ? SENTIMENT_CFG[call.sentiment] : null;
  const prio = call.priority ? PRIORITY_CFG[call.priority] : null;

  return (
    <tr
      className="border-b border-white/[0.05] hover:bg-white/[0.025] cursor-pointer transition-colors"
      onClick={() => onClick(call.id)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
          <div>
            <div className="text-[12px] font-medium text-white/80 truncate max-w-[160px]">{call.filename}</div>
            <div className="text-[10px] text-white/30">{fmtDate(call.created_at)}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-[11px] text-white/40">{fmtDuration(call.duration_seconds)}</td>
      <td className="px-4 py-3">
        {sent ? (
          <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${sent.bg}`} style={{ color: sent.color }}>
            {sent.icon} {sent.label}
          </span>
        ) : (
          <span className="text-[11px] text-white/20">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="text-[12px] text-white/70">{call.category ?? '—'}</div>
        {call.subcategory && <div className="text-[10px] text-white/30">{call.subcategory}</div>}
      </td>
      <td className="px-4 py-3">
        {prio ? (
          <span className={`px-2 py-1 rounded text-[10px] font-medium ${prio.bg}`} style={{ color: prio.color }}>
            {prio.label}
          </span>
        ) : (
          <span className="text-[11px] text-white/20">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1.5">
          {call.is_lead && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-500/20 text-blue-300">ЛИД</span>
          )}
          {call.is_complaint && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-500/20 text-red-300">ЖАЛОБА</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          className="px-2 py-1 text-[10px] text-white/20 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
          onClick={e => { e.stopPropagation(); onDelete(call.id); }}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CallsPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState<CallAnalytics | null>(null);
  const [trends, setTrends]     = useState<CallTrend[]>([]);
  const [topics, setTopics]     = useState<CallTopics | null>(null);
  const [calls, setCalls]       = useState<CallRecord[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'leads' | 'complaints'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSentiment, setFilterSentiment] = useState('');
  const [filterCategory, setFilterCategory]   = useState('');
  const [pollingTimer, setPollingTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [a, t, tp, c] = await Promise.all([
        getCallsAnalytics(days),
        getCallsTrends(days),
        getCallsTopics(days),
        getCalls({
          days,
          limit: 50,
          isLead:      activeTab === 'leads'      ? true : undefined,
          isComplaint: activeTab === 'complaints' ? true : undefined,
          sentiment:   filterSentiment || undefined,
          category:    filterCategory  || undefined,
          search:      searchQuery     || undefined,
        }),
      ]);
      setAnalytics(a);
      setTrends(t.trends);
      setTopics(tp);
      setCalls(c.calls);
      setTotal(c.total);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, [days, activeTab, filterSentiment, filterCategory, searchQuery]);

  useEffect(() => {
    setLoading(true);
    void loadAll();
  }, [loadAll]);

  // Poll for processing calls every 5s
  useEffect(() => {
    if (pollingTimer) clearInterval(pollingTimer);
    const hasProcessing = calls.some(c => c.status === 'processing' || c.status === 'pending');
    if (hasProcessing) {
      const t = setInterval(() => void loadAll(), 5000);
      setPollingTimer(t);
      return () => clearInterval(t);
    }
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls]);

  async function handleDelete(id: string): Promise<void> {
    if (!confirm('Удалить запись о звонке?')) return;
    await deleteCall(id);
    void loadAll();
  }

  const anomalies = trends.filter(t => t.isAnomaly);
  const classifiedPct = analytics
    ? analytics.total > 0 ? Math.round((analytics.classified / analytics.total) * 100) : 0
    : 0;

  return (
    <AdminLayout title="Аналитика звонков">
      <div className="px-6 py-5 space-y-5">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-white flex items-center gap-2">
              📞 Voice of Customer Analytics
            </h2>
            <p className="text-[12px] text-white/40 mt-0.5">
              Автоматическая транскрипция · Классификация AI · Управленческая аналитика
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

        {/* ── Anomaly banner ─────────────────────────────────────────────── */}
        {!loading && anomalies.length > 0 && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 flex items-center gap-3">
            <span className="text-xl">📊</span>
            <div className="flex-1">
              <p className="text-[12px] font-semibold text-orange-300">Аномальные изменения в обращениях</p>
              <p className="text-[11px] text-white/50">
                {anomalies.map(a =>
                  `${CAT_ICONS[a.category] ?? ''} ${a.category} ${a.direction === 'up' ? '+' : ''}${a.changePct}%`
                ).join(' · ')}
              </p>
            </div>
          </div>
        )}

        {/* ── KPI grid ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3">
          <KpiBox label="Всего звонков"       value={analytics?.total ?? '—'}      sub={`за ${days} дней`} />
          <KpiBox label="Классифицировано"    value={analytics ? `${classifiedPct}%` : '—'}
            sub={`${analytics?.classified ?? 0} из ${analytics?.total ?? 0}`} accent="#3b82f6" />
          <KpiBox label="Коммерческие"        value={analytics?.commercial ?? '—'} sub="потенциальные лиды" accent="#34d399" />
          <KpiBox label="Жалобы"              value={analytics?.complaints ?? '—'} sub="требуют реакции"   accent="#f97316" />
        </div>

        <div className="grid grid-cols-4 gap-3">
          <KpiBox label="Средняя длительность" value={fmtDuration(analytics?.avgDuration ?? 0)} />
          <KpiBox label="Позитивные"   value={analytics?.positive ?? '—'} accent="#34d399" />
          <KpiBox label="Нейтральные"  value={analytics?.neutral  ?? '—'} accent="#94a3b8" />
          <KpiBox label="Негативные"   value={analytics?.negative ?? '—'} accent="#ef4444" />
        </div>

        {/* ── Two-column: Upload + Trends ────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <UploadZone onUploaded={() => setTimeout(() => void loadAll(), 1000)} />

          <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📈</span>
              <h3 className="text-[13px] font-semibold text-white">Динамика обращений</h3>
              <span className="ml-auto text-[10px] text-white/25">текущий vs предыдущий период</span>
            </div>
            {trends.length === 0 ? (
              <p className="text-[12px] text-white/25 py-6 text-center">Недостаточно данных для сравнения</p>
            ) : (
              <div>
                {trends.slice(0, 8).map(t => (
                  <TrendBadge key={t.category} trend={t} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Topics ────────────────────────────────────────────────────── */}
        {topics && topics.topCategories.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-5">
              <h3 className="text-[13px] font-semibold text-white mb-3">🏆 ТОП категорий</h3>
              {topics.topCategories.map((c, i) => (
                <div key={c.category} className="flex items-center gap-2 py-1.5">
                  <span className="text-[11px] text-white/25 w-4">{i + 1}</span>
                  <span className="text-[14px]">{CAT_ICONS[c.category] ?? '📋'}</span>
                  <span className="text-[12px] text-white/70 flex-1">{c.category}</span>
                  <span className="text-[12px] font-semibold text-white">{c.count}</span>
                </div>
              ))}
            </div>
            <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-5">
              <h3 className="text-[13px] font-semibold text-white mb-3">🔍 ТОП подкатегорий</h3>
              {topics.topSubcategories.length === 0 ? (
                <p className="text-[12px] text-white/25 py-4 text-center">Нет данных</p>
              ) : (
                topics.topSubcategories.map((s, i) => (
                  <div key={s.subcategory} className="flex items-center gap-2 py-1.5">
                    <span className="text-[11px] text-white/25 w-4">{i + 1}</span>
                    <span className="text-[12px] text-white/70 flex-1 truncate">{s.subcategory}</span>
                    <span className="text-[12px] font-semibold text-white">{s.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Calls table ────────────────────────────────────────────────── */}
        <div className="bg-[#161b27] rounded-xl border border-white/[0.07]">
          {/* Table header controls */}
          <div className="px-4 py-3 border-b border-white/[0.07] flex items-center gap-3 flex-wrap">
            <div className="flex gap-1">
              {(['all', 'leads', 'complaints'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={['px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                    activeTab === tab ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/[0.04]'].join(' ')}>
                  {tab === 'all' ? `Все (${total})` : tab === 'leads' ? '🎯 Лиды' : '⚠️ Жалобы'}
                </button>
              ))}
            </div>
            <div className="flex gap-2 ml-auto">
              <select value={filterSentiment} onChange={e => setFilterSentiment(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-[11px] text-white/60 focus:outline-none">
                <option value="">Тональность</option>
                <option value="positive">Позитивный</option>
                <option value="neutral">Нейтральный</option>
                <option value="negative">Негативный</option>
              </select>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-[11px] text-white/60 focus:outline-none">
                <option value="">Категория</option>
                {['Вклады','Кредиты','Автокредиты','Ипотека','Карты','Мобильное приложение','Филиалы','Поддержка','Жалобы'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Поиск по транскрипту…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-1.5 text-[11px] text-white/60 placeholder:text-white/20 focus:outline-none w-44"
              />
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-12 text-center text-[13px] text-white/30">Загружаем данные…</div>
          ) : calls.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-4xl mb-3">🎙️</div>
              <p className="text-[13px] text-white/40 font-medium">Нет записей</p>
              <p className="text-[11px] text-white/20 mt-1">Загрузите аудиофайлы для начала анализа</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-white/25 uppercase tracking-wide border-b border-white/[0.07]">
                  <th className="px-4 py-2 text-left">Файл / Дата</th>
                  <th className="px-4 py-2 text-left">Длит.</th>
                  <th className="px-4 py-2 text-left">Тональность</th>
                  <th className="px-4 py-2 text-left">Категория</th>
                  <th className="px-4 py-2 text-left">Приоритет</th>
                  <th className="px-4 py-2 text-left">Теги</th>
                  <th className="px-4 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {calls.map(call => (
                  <CallRow
                    key={call.id}
                    call={call}
                    onDelete={handleDelete}
                    onClick={id => navigate(`/admin/calls/${id}`)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </AdminLayout>
  );
}
