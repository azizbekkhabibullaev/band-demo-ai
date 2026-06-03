import { useState, useEffect } from 'react';
import { AdminLayout } from '../components/Layout.tsx';
import { getConversations, getConversationMessages, type ConversationSummary, type ChatMessage } from '../api/client.ts';

const FLAG: Record<string, string> = { uz: '🇺🇿', ru: '🇷🇺', en: '🇬🇧' };
const INTENT_DISPLAY: Record<string, string> = {
  depozit: 'Deposits', kredit_ariza: 'Loans', karta_chiqarish: 'Cards',
  mobile_bank: 'Mobile', filial: 'Branch', o_tkazma: 'Transfer', boshqa_savol: 'Other',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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
    <AdminLayout title="Conversations">
      <div className="flex h-full">
        {/* Left: list */}
        <div className="flex flex-col w-80 border-r border-white/[0.06] shrink-0 overflow-hidden">
          {/* Filters */}
          <div className="p-3 border-b border-white/[0.06] space-y-2">
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search messages…"
              className="w-full px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07]
                text-[12px] text-white placeholder-white/25 outline-none focus:border-blue-500/40"
            />
            <div className="flex gap-1.5">
              {['', 'uz', 'ru', 'en'].map(l => (
                <button
                  key={l}
                  onClick={() => { setLang(l); setPage(0); }}
                  className={[
                    'px-2.5 py-1 rounded-md text-[10px] font-medium transition-all',
                    lang === l ? 'bg-blue-600 text-white' : 'bg-white/[0.04] text-white/40 hover:text-white',
                  ].join(' ')}
                >
                  {l ? (FLAG[l] + ' ' + l.toUpperCase()) : 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-20 text-white/30 text-[12px]">Loading…</div>
            ) : convs.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-white/30 text-[12px]">No conversations</div>
            ) : convs.map(conv => (
              <button
                key={conv.sessionId}
                onClick={() => openConv(conv)}
                className={[
                  'w-full text-left px-3 py-2.5 border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]',
                  selected?.sessionId === conv.sessionId ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : '',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-white/30 font-mono">{conv.sessionId.slice(0, 8)}</span>
                  <div className="flex items-center gap-1">
                    {conv.hadEscalation && <span className="text-[9px] text-orange-400">⚠</span>}
                    {conv.hadLead && <span className="text-[9px] text-emerald-400">📞</span>}
                    <span className="text-[9px] text-white/25">{timeAgo(conv.startedAt)}</span>
                  </div>
                </div>
                <div className="text-[12px] text-white/70 truncate leading-snug">
                  {conv.lastUserMessage || <span className="italic text-white/30">No messages</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px]">{FLAG[conv.lang]}</span>
                  <span className="text-[9px] text-white/30">{conv.messageCount} msgs</span>
                  {conv.topIntent && (
                    <span className="text-[9px] text-blue-400/70">
                      {INTENT_DISPLAY[conv.topIntent] ?? conv.topIntent}
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
                className="disabled:opacity-30 hover:text-white">← Prev</button>
              <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}
                className="disabled:opacity-30 hover:text-white">Next →</button>
            </div>
          )}
        </div>

        {/* Right: messages */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-white/25">
              <div className="text-4xl mb-3">💬</div>
              <p className="text-[13px]">Select a conversation</p>
            </div>
          ) : (
            <div className="p-4">
              {/* Conv header */}
              <div className="mb-4 pb-3 border-b border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-semibold text-white">
                      Session {selected.sessionId.slice(0, 12)}…
                    </div>
                    <div className="text-[11px] text-white/40 mt-0.5">
                      {FLAG[selected.lang]} {selected.lang.toUpperCase()} ·
                      {selected.messageCount} messages ·
                      {new Date(selected.startedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {selected.hadEscalation && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-orange-500/15 text-orange-400">Escalated</span>
                    )}
                    {selected.hadLead && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-400">Lead</span>
                    )}
                  </div>
                </div>
              </div>

              {msgLoading ? (
                <div className="text-center text-white/30 text-[12px] py-8">Loading messages…</div>
              ) : (
                <div className="space-y-2">
                  {messages.map(msg => (
                    <div key={msg.id} className={['flex', msg.role === 'user' ? 'justify-end' : 'justify-start'].join(' ')}>
                      <div className={[
                        'max-w-[80%] px-3.5 py-2 rounded-xl text-[12.5px] leading-relaxed',
                        msg.role === 'user'
                          ? 'bg-blue-600/25 text-white/90 rounded-br-sm'
                          : 'bg-white/[0.06] text-white/80 rounded-bl-sm',
                      ].join(' ')}>
                        {msg.content}
                        {msg.escalation_signaled && (
                          <div className="mt-1 text-[10px] text-orange-400/70">⚠ escalation signaled</div>
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
