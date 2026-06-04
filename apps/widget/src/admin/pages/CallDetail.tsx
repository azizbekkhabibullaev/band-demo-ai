/**
 * VOC Analytics — Детальная страница звонка
 * Shows: audio player, full transcript, AI summary, classification, lead/complaint status
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminLayout } from '../components/Layout.tsx';
import { getCall, deleteCall, type CallRecord, type Sentiment, type Priority } from '../api/callsClient.ts';

// ─── Label configs ────────────────────────────────────────────────────────────

const SENTIMENT_CFG: Record<Sentiment, { label: string; color: string; bg: string; icon: string }> = {
  positive: { label: 'Позитивный', color: '#34d399', bg: 'bg-emerald-500/15', icon: '😊' },
  neutral:  { label: 'Нейтральный', color: '#94a3b8', bg: 'bg-slate-500/15',  icon: '😐' },
  negative: { label: 'Негативный',  color: '#ef4444', bg: 'bg-red-500/15',    icon: '😠' },
};

const PRIORITY_CFG: Record<Priority, { label: string; color: string; bg: string }> = {
  low:      { label: 'Низкий',     color: '#64748b', bg: 'bg-slate-600/20' },
  medium:   { label: 'Средний',    color: '#f59e0b', bg: 'bg-amber-500/20' },
  high:     { label: 'Высокий',    color: '#f97316', bg: 'bg-orange-500/20' },
  critical: { label: 'Критичный',  color: '#ef4444', bg: 'bg-red-500/20' },
};

const STATUS_CFG = {
  pending:    { label: 'В очереди',   color: '#94a3b8', bg: 'bg-slate-500/15' },
  processing: { label: 'Обработка…', color: '#3b82f6', bg: 'bg-blue-500/15'  },
  completed:  { label: 'Готово',      color: '#34d399', bg: 'bg-emerald-500/15' },
  failed:     { label: 'Ошибка',      color: '#ef4444', bg: 'bg-red-500/15'   },
};

const LANG_LABELS: Record<string, string> = {
  ru: '🇷🇺 Русский',
  uz: '🇺🇿 Узбекский',
  en: '🇬🇧 Английский',
};

const CAT_ICONS: Record<string, string> = {
  'Вклады': '💰', 'Кредиты': '🏦', 'Автокредиты': '🚗', 'Ипотека': '🏠',
  'Карты': '💳', 'Мобильное приложение': '📱', 'Филиалы': '🏢',
  'Поддержка': '🎧', 'Брокерские услуги': '📈', 'Жалобы': '⚠️', 'Другое': '📋',
};

function fmtDuration(secs: number): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/[0.05] last:border-0">
      <span className="text-[11px] text-white/30 w-36 flex-shrink-0 pt-0.5">{label}</span>
      <div className="text-[12px] text-white/80">{children}</div>
    </div>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-white/[0.08] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${(value / max) * 100}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [call, setCall] = useState<CallRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadCall(): Promise<void> {
    try {
      const res = await getCall(id!);
      setCall(res.call);
      // Stop polling once completed or failed
      if (res.call.status === 'completed' || res.call.status === 'failed') {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCall();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll if still processing
  useEffect(() => {
    if (call && (call.status === 'pending' || call.status === 'processing')) {
      pollingRef.current = setInterval(() => void loadCall(), 3000);
    }
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.status]);

  async function handleDelete(): Promise<void> {
    if (!confirm('Удалить эту запись звонка? Действие необратимо.')) return;
    setDeleting(true);
    try {
      await deleteCall(id!);
      navigate('/admin/calls');
    } catch {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout title="Детали звонка">
        <div className="flex items-center justify-center h-64 text-white/30 text-[13px]">
          Загружаем данные…
        </div>
      </AdminLayout>
    );
  }

  if (error || !call) {
    return (
      <AdminLayout title="Детали звонка">
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="text-3xl">❌</div>
          <p className="text-[13px] text-white/40">{error || 'Запись не найдена'}</p>
          <button onClick={() => navigate('/admin/calls')}
            className="px-4 py-2 bg-blue-600 text-white text-[12px] rounded-lg">
            ← Назад к списку
          </button>
        </div>
      </AdminLayout>
    );
  }

  const sent  = call.sentiment ? SENTIMENT_CFG[call.sentiment] : null;
  const prio  = call.priority  ? PRIORITY_CFG[call.priority]   : null;
  const st    = STATUS_CFG[call.status] ?? STATUS_CFG.completed;
  const catIcon = call.category ? (CAT_ICONS[call.category] ?? '📋') : '📋';
  const isProcessing = call.status === 'pending' || call.status === 'processing';
  const topics: string[] = Array.isArray(call.topics) ? call.topics : [];

  return (
    <AdminLayout title="Детали звонка">
      <div className="px-6 py-5 space-y-4">

        {/* ── Breadcrumb + actions ──────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/admin/calls')}
            className="flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition-colors"
          >
            ← Аналитика звонков
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            {deleting ? '…' : '🗑 Удалить'}
          </button>
        </div>

        {/* ── Processing banner ─────────────────────────────────────────── */}
        {isProcessing && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="text-[13px] font-semibold text-blue-300">
                {call.status === 'pending' ? 'Файл в очереди на обработку' : 'Транскрибируем и анализируем…'}
              </p>
              <p className="text-[11px] text-white/30">Страница обновляется автоматически</p>
            </div>
          </div>
        )}

        {/* ── Failed banner ─────────────────────────────────────────────── */}
        {call.status === 'failed' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <p className="text-[13px] font-semibold text-red-300">⚠️ Ошибка обработки</p>
            {call.error_message && (
              <p className="text-[11px] text-white/40 mt-1 font-mono">{call.error_message}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">

          {/* ── Left column: call metadata + classification ───────────── */}
          <div className="col-span-1 space-y-4">

            {/* Call info */}
            <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">📞</span>
                <div>
                  <div className="text-[12px] font-semibold text-white truncate max-w-[160px]">{call.filename}</div>
                  <div className="text-[10px] text-white/30">{fmtDateTime(call.created_at)}</div>
                </div>
              </div>
              <InfoRow label="Статус">
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${st.bg}`} style={{ color: st.color }}>
                  {st.label}
                </span>
              </InfoRow>
              <InfoRow label="Длительность">{fmtDuration(call.duration_seconds)}</InfoRow>
              <InfoRow label="Язык">{LANG_LABELS[call.language] ?? call.language}</InfoRow>
            </div>

            {/* Classification */}
            {call.status === 'completed' && (
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-4">
                <h3 className="text-[12px] font-semibold text-white/60 mb-3 uppercase tracking-wide">Классификация</h3>
                <InfoRow label="Категория">
                  <span className="flex items-center gap-1.5">
                    <span>{catIcon}</span>
                    <span>{call.category ?? '—'}</span>
                  </span>
                </InfoRow>
                <InfoRow label="Подкатегория">{call.subcategory || '—'}</InfoRow>
                <InfoRow label="Тональность">
                  {sent ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sent.bg}`} style={{ color: sent.color }}>
                      {sent.icon} {sent.label}
                    </span>
                  ) : '—'}
                </InfoRow>
                <InfoRow label="Уверенность">
                  {call.sentiment_score != null ? (
                    <ScoreBar
                      value={Math.round(call.sentiment_score * 100)}
                      color={sent?.color ?? '#94a3b8'}
                    />
                  ) : '—'}
                </InfoRow>
                <InfoRow label="Приоритет">
                  {prio ? (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${prio.bg}`} style={{ color: prio.color }}>
                      {prio.label}
                    </span>
                  ) : '—'}
                </InfoRow>
                {topics.length > 0 && (
                  <InfoRow label="Темы">
                    <div className="flex flex-wrap gap-1">
                      {topics.map(t => (
                        <span key={t} className="px-1.5 py-0.5 bg-white/[0.06] rounded text-[10px] text-white/50">
                          {t}
                        </span>
                      ))}
                    </div>
                  </InfoRow>
                )}
              </div>
            )}

            {/* Lead */}
            {call.is_lead && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🎯</span>
                  <h3 className="text-[12px] font-semibold text-blue-300">Лид обнаружен</h3>
                </div>
                <div className="mb-2">
                  <div className="text-[10px] text-white/30 mb-1">Скор лида</div>
                  <ScoreBar
                    value={call.lead_score}
                    color={call.lead_score >= 90 ? '#ef4444' : call.lead_score >= 70 ? '#f59e0b' : '#3b82f6'}
                  />
                </div>
                {call.lead_interest && (
                  <p className="text-[11px] text-white/60">Интерес: <strong className="text-white/80">{call.lead_interest}</strong></p>
                )}
                {call.lead_id && (
                  <p className="text-[10px] text-white/30 mt-1">
                    Лид создан ·{' '}
                    {call.lead_name && <span className="text-white/50">{call.lead_name}</span>}
                    {call.lead_phone && <span className="text-white/50"> {call.lead_phone}</span>}
                  </p>
                )}
              </div>
            )}

            {/* Complaint */}
            {call.is_complaint && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">⚠️</span>
                  <h3 className="text-[12px] font-semibold text-red-300">Жалоба обнаружена</h3>
                </div>
                {call.complaint_notes && (
                  <p className="text-[11px] text-white/60">{call.complaint_notes}</p>
                )}
              </div>
            )}
          </div>

          {/* ── Right column: summary + transcript ────────────────────── */}
          <div className="col-span-2 space-y-4">

            {/* AI Summary */}
            {call.summary && (
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">✨</span>
                  <h3 className="text-[13px] font-semibold text-white">AI Резюме</h3>
                  <span className="ml-auto text-[10px] px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded-full">GPT-4o mini</span>
                </div>
                <p className="text-[13px] leading-relaxed text-white/75">{call.summary}</p>
              </div>
            )}

            {/* Full transcript */}
            <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📝</span>
                <h3 className="text-[13px] font-semibold text-white">Транскрипт</h3>
                <span className="ml-auto text-[10px] text-white/25">Whisper STT</span>
              </div>
              {isProcessing ? (
                <div className="text-center py-8 text-white/30 text-[12px]">
                  Транскрипция в процессе…
                </div>
              ) : call.transcript ? (
                <div className="bg-[#0f1117] rounded-lg p-4 max-h-[400px] overflow-y-auto">
                  <p className="text-[12.5px] leading-relaxed text-white/70 whitespace-pre-wrap font-mono">
                    {call.transcript}
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-white/25 text-[12px]">
                  {call.status === 'failed' ? 'Транскрипция не удалась' : 'Транскрипт пуст'}
                </div>
              )}
            </div>

            {/* Related records */}
            {(call.lead_id || call.is_complaint) && (
              <div className="bg-[#161b27] rounded-xl border border-white/[0.07] p-5">
                <h3 className="text-[13px] font-semibold text-white mb-3">🔗 Связанные записи</h3>
                <div className="space-y-2">
                  {call.lead_id && (
                    <div className="flex items-center gap-3 p-3 bg-blue-500/10 rounded-lg">
                      <span className="text-lg">🎯</span>
                      <div className="flex-1">
                        <p className="text-[12px] font-medium text-blue-300">Лид создан автоматически</p>
                        <p className="text-[10px] text-white/30">
                          {call.lead_interest} · Скор {call.lead_score}/100
                          {call.lead_status && ` · ${call.lead_status}`}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                        call.lead_score >= 90 ? 'bg-red-500/20 text-red-300' :
                        call.lead_score >= 70 ? 'bg-amber-500/20 text-amber-300' :
                        'bg-blue-500/20 text-blue-300'
                      }`}>
                        {call.lead_score >= 90 ? 'HOT' : call.lead_score >= 70 ? 'WARM' : 'COLD'}
                      </span>
                    </div>
                  )}
                  {call.is_complaint && (
                    <div className="flex items-center gap-3 p-3 bg-red-500/10 rounded-lg">
                      <span className="text-lg">⚠️</span>
                      <div className="flex-1">
                        <p className="text-[12px] font-medium text-red-300">Жалоба зафиксирована</p>
                        {call.complaint_notes && (
                          <p className="text-[10px] text-white/30">{call.complaint_notes}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
