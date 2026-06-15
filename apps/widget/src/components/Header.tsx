const ONLINE: Record<string, string> = {
  uz: 'Onlayn',
  ru: 'Онлайн',
};

interface Props {
  displayName: string;
  lang: string;
  enabledLangs: string[];
  onClose: () => void;
  onLangChange: (lang: string) => void;
  onVoiceToggle?: () => void;
  voiceActive?: boolean;
}

export function Header({ displayName, lang, enabledLangs, onClose, onLangChange, onVoiceToggle, voiceActive }: Props) {
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-3.5 rounded-t-widget"
      style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 60%, #3b82f6 100%)' }}>

      {/* Bank avatar */}
      <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center
        justify-center shrink-0 shadow-sm border border-white/20">
        <span className="text-white text-xs font-bold tracking-tight">{initials}</span>
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold text-white leading-tight truncate">
          {displayName}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
          </span>
          <span className="text-[10.5px] text-blue-100 font-medium">
            {ONLINE[lang] ?? ONLINE['ru']}
          </span>
        </div>
      </div>

      {/* Voice toggle — only for Russian (Phase 1) */}
      {onVoiceToggle && lang === 'ru' && (
        <button
          onClick={onVoiceToggle}
          title={voiceActive ? 'Вернуться в чат' : 'Голосовой режим'}
          aria-label={voiceActive ? 'Вернуться в чат' : 'Голосовой режим'}
          className={[
            'shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150',
            voiceActive
              ? 'bg-blue-300/30 ring-1 ring-blue-300/50'
              : 'hover:bg-white/15 active:bg-white/25',
          ].join(' ')}>
          {voiceActive ? (
            /* Chat icon — return to text */
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white/90">
              <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H6l-4 4V5z" clipRule="evenodd"/>
            </svg>
          ) : (
            /* Mic icon — enter voice */
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white/90">
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/>
            </svg>
          )}
        </button>
      )}

      {/* Language toggle */}
      {enabledLangs.length > 1 && (
        <div className="flex items-center gap-0.5 bg-white/10 rounded-lg p-0.5">
          {enabledLangs.map(l => (
            <button
              key={l}
              onClick={() => onLangChange(l)}
              className={[
                'px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-all duration-150',
                lang === l
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-white/70 hover:text-white',
              ].join(' ')}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Close chat"
        className="shrink-0 w-7 h-7 rounded-full hover:bg-white/15 active:bg-white/25
          transition-colors flex items-center justify-center"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white/90">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}
