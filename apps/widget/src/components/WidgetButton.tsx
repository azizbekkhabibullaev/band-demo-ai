interface Props {
  isOpen: boolean;
  onClick: () => void;
}

export function WidgetButton({ isOpen, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      aria-label={isOpen ? 'Close chat' : 'Open Ipoteka Bank AI'}
      className="relative w-[60px] h-[60px] rounded-full text-white flex items-center
        justify-center active:scale-95 transition-all duration-150"
      style={{
        background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
        boxShadow: isOpen
          ? '0 4px 20px rgba(37,99,235,0.35)'
          : '0 8px 32px rgba(37,99,235,0.45), 0 2px 8px rgba(37,99,235,0.2)',
      }}
    >
      {/* Pulse ring — only when closed */}
      {!isOpen && (
        <span className="absolute inset-0 rounded-full animate-ping"
          style={{ background: 'rgba(37,99,235,0.25)', animationDuration: '2.4s' }} />
      )}

      {/* Icon — AI sparkle when closed, X when open */}
      {isOpen ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 relative">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      ) : (
        /* Sparkle / AI star icon */
        <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 relative">
          <path d="M12 3L14 9H20L15 13L17 19L12 15L7 19L9 13L4 9H10L12 3Z" fill="white" fillOpacity="0.95"/>
          <circle cx="19" cy="5" r="1.5" fill="white" fillOpacity="0.7"/>
          <circle cx="5"  cy="18" r="1"   fill="white" fillOpacity="0.5"/>
        </svg>
      )}
    </button>
  );
}
