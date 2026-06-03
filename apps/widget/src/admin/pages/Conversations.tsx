import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { getConversations, getConversationMessages, type ConversationSummary, type ChatMessage } from '../api/client.ts';

const FLAG: Record<string, string> = { uz: '🇺🇿', ru: '🇷🇺' };
const PRODUCT_RU: Record<string, string> = {
  depozit: 'Депозиты', kredit_ariza: 'Кредиты', karta_chiqarish: 'Карты',
  mobile_bank: 'Мобильный', filial: 'Отделения', o_tkazma: 'Переводы', boshqa_savol: 'Прочее',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} д назад`;
}

export function ConversationsPage() {
  const [convs, setConvs] = useState<ConversationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [lang, setLang] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  const PAGE_SIZE = 20;

  useEffect(() => {
    setLoading(true);
    getConversations({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, lang: lang || undefined, search: search || undefined })
      .then(res => { setConvs(res.conversations); setTotal(res.total); })
      .finally(() => setLoading(false));
  }, [page, lang, search]);

  async function openConv(conv: ConversationSummary) {
    setSelected(conv);
    setMsgLoading(true);
    try {
      const res = await getConversationMessages(conv.sessionId);
      setMessages(res.messages);
    } finally {
      setMsgLoading(false);
    }
  }

  return (
    <AdminLayout title="Диалоги">
      <div className="flex h-full">
        {/* ── Left: conversation list ── */}
        <div className="flex flex-col w-80 border-r border-white/[0.06] shrink-0 overflow-hidden">
          {/* Filters */}
          <div className="p-3 border-b border-white/[0.06] space-y-2">
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Поиск по тексту…"
              className="w-full px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07]
                text-[12px] text-white placeholder-white/25 outline-none focus:border-blue-500/40"
            />
            <div className="flex gap-1.5">
              {['', 'uz', 'ru'].map(l => (
                <button key={l} onClick={() => { setLang(l); setPage(0); }}
                  className={['px-2.5 py-1 rounded-md text-[10px] font-medium transition-all',
                    lang === l ? 'bg-blue-600 text-white' : 'bg-white/[0.04] text-white/40 hover:text-white'].join(' ')}>
                  {l ? (FLAG[l] + ' ' + l.toUpperCase()) : 'Все'}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-20 text-white/30 text-[12px]">Загрузка…</div>
            ) : convs.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-white/30 text-[12px]">Нет диалогов</div>
            ) : convs.map(conv => (
              <button key={conv.sessionId} onClick={() => openConv(conv)}
                className={['w-full text-left px-3 py-2.5 border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]',
                  selected?.sessionId === conv.sessionId ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : ''].join(' ')}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-white/30 font-mono">{conv.sessionId.slice(0, 8)}</span>
                  <div className="flex items-center gap-1">
                    {conv.hadLead && <span className="text-[9px] text-amber-400" title="Лид">👥</span>}
                    {conv.hadEscalation && <span className="text-[9px] text-orange-400" title="Жалоба">⚠</span>}
                    <span className="text-[9px] text-white/25">{timeAgo(conv.startedAt)}</span>
                  </div>
                </div>
                <div className="text-[12px] text-white/70 truncate leading-snug">
                  {conv.lastUserMessage || <span className="italic text-white/30">Нет сообщений</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px]">{FLAG[conv.lang] ?? '🌐'}</span>
                  <span className="text-[9px] text-white/30">{conv.messageCount} сообщ.</span>
                  {conv.topIntent && (
                    <span className="text-[9px] text-blue-400/70">
                      {PRODUCT_RU[conv.topIntent] ?? conv.topIntent}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-white/[0.06] text-[11px] text-white/40">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="disabled:opacity-30 hover:text-white">← Назад</button>
              <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} из {total}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}
                className="disabled:opacity-30 hover:text-white">Далее →</button>
            </div>
          )}
        </div>

        {/* ── Right: message thread ── */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-white/25">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-[13px]">Выберите диалог</p>
            </div>
          ) : (
            <div className="p-4">
              {/* Conversation header */}
              <div className="mb-4 pb-3 border-b border-white/[0.06]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[13px] font-semibold text-white">
                      Сессия {selected.sessionId.slice(0, 12)}…
                    </div>
                    <div className="text-[11px] text-white/40 mt-0.5">
                      {FLAG[selected.lang] ?? '🌐'} {selected.lang.toUpperCase()} ·
                      {' '}{selected.messageCount} сообщений ·
                      {' '}{new Date(selected.startedAt).toLocaleString('ru-RU')}
                    </div>
                    {selected.topIntent && (
                      <div className="text-[11px] text-blue-400/80 mt-0.5">
                        🎯 Интерес: {PRODUCT_RU[selected.topIntent] ?? selected.topIntent}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {selected.hadLead && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20">
                        👥 Лид
                      </span>
                    )}
                    {selected.hadEscalation && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-orange-500/15 text-orange-400 border border-orange-500/20">
                        ⚠ Жалоба
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {msgLoading ? (
                <div className="text-center text-white/30 text-[12px] py-8">Загрузка переписки…</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-white/30 text-[12px] py-8">Нет сообщений</div>
              ) : (
                <div className="space-y-2">
                  {messages.map(msg => (
                    <div key={msg.id} className={['flex', msg.role === 'user' ? 'justify-end' : 'justify-start'].join(' ')}>
                      <div className={[
                        'max-w-[80%] px-3.5 py-2.5 rounded-xl text-[12.5px] leading-relaxed',
                        msg.role === 'user'
                          ? 'bg-blue-600/25 text-white/90 rounded-br-sm'
                          : 'bg-white/[0.06] text-white/80 rounded-bl-sm',
                      ].join(' ')}>
                        <div className="text-[9px] text-white/30 mb-1 font-medium">
                          {msg.role === 'user' ? '👤 Клиент' : '🤖 AI Банкир'}
                        </div>
                        {msg.content}
                        {msg.escalation_signaled && (
                          <div className="mt-1.5 text-[10px] text-orange-400/70 flex items-center gap-1">
                            <span>⚠</span> Сигнал жалобы
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
