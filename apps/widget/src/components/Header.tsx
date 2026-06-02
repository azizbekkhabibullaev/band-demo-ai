interface Props {
  displayName: string;
  onClose: () => void;
}

export function Header({ displayName, onClose }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[--accent-color] text-white rounded-t-2xl">
      <span className="font-semibold text-sm truncate">{displayName}</span>
      <button
        onClick={onClose}
        aria-label="Close chat"
        className="hover:opacity-75 transition-opacity ml-2 shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}
