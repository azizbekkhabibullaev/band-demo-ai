import { useRef, useState, type KeyboardEvent } from 'react';

const MAX_CHARS = 2000;
const COUNTER_THRESHOLD = 200;

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function InputBar({ onSend, disabled }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charsLeft = MAX_CHARS - value.length;
  const canSend = !disabled && value.trim().length > 0 && value.length <= MAX_CHARS;

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleInput() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 24;
    const maxHeight = lineHeight * 4;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }

  return (
    <div className="border-t border-gray-200 p-3 bg-white rounded-b-2xl">
      {charsLeft <= COUNTER_THRESHOLD && (
        <div className={`text-xs text-right mb-1 ${charsLeft < 0 ? 'text-red-500' : 'text-gray-400'}`}>
          {charsLeft}
        </div>
      )}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          aria-label="Message"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:opacity-50 leading-6 min-h-[36px] max-h-[96px]"
        />
        <button
          onClick={submit}
          disabled={!canSend}
          className="shrink-0 w-9 h-9 rounded-full bg-[--accent-color] text-white flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
          aria-label="Send"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3.105 2.288a.75.75 0 00-.826.95l1.903 6.115a.75.75 0 00.608.509L11.5 10.5l-6.71.638a.75.75 0 00-.608.509L2.28 17.762a.75.75 0 00.826.95l15.5-7.5a.75.75 0 000-1.424l-15.5-7.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
