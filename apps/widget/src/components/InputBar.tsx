import React, { useRef, useState, useEffect, type KeyboardEvent } from 'react';

const MAX_CHARS = 2000;
const COUNTER_THRESHOLD = 200;

const PLACEHOLDERS: Record<string, string[]> = {
  uz: [
    'Depozit haqida so\'rang…',
    'Kredit shartlari qanday?',
    'Kartani qanday rasmiylashtirish?',
    'Savolingizni yozing…',
  ],
  ru: [
    'Спросите о вкладах…',
    'Какие условия по кредиту?',
    'Как оформить карту?',
    'Напишите ваш вопрос…',
  ],
  en: [
    'Ask about deposits…',
    'What are the loan terms?',
    'How to get a card?',
    'Type your question…',
  ],
};

const HINTS: Record<string, string> = {
  uz: 'Enter — yuborish · Shift+Enter — yangi qator',
  ru: 'Enter — отправить · Shift+Enter — новая строка',
  en: 'Enter to send · Shift+Enter for new line',
};

interface Props {
  onSend: (text: string) => void;
  disabled: boolean;
  lang?: string;
}

export function InputBar({ onSend, disabled, lang = 'ru' }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const placeholders = PLACEHOLDERS[lang] ?? PLACEHOLDERS['ru']!;
  const placeholder = placeholders[Math.floor(Date.now() / 8000) % placeholders.length]!;

  const charsLeft = MAX_CHARS - value.length;
  const canSend = !disabled && value.trim().length > 0 && value.length <= MAX_CHARS;

  // Auto-focus whenever input becomes enabled (widget opens, AI finishes responding)
  useEffect(() => {
    if (!disabled) {
      // Small delay ensures the DOM is ready and any animations have settled
      const t = setTimeout(() => textareaRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [disabled]);

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    // Keep focus after sending
    textareaRef.current?.focus();
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
    <div className="shrink-0 border-t border-slate-100 px-3 py-2.5 bg-white rounded-b-widget">
      {charsLeft <= COUNTER_THRESHOLD && (
        <div className={`text-[10px] text-right mb-1 font-medium ${charsLeft < 0 ? 'text-red-500' : 'text-slate-400'}`}>
          {charsLeft}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2 items-end">
        <div className={[
          'flex-1 flex items-end rounded-xl border transition-all duration-150',
          disabled
            ? 'border-slate-100 bg-slate-50'
            : 'border-slate-200 bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100/60',
        ].join(' ')}>
          <textarea
            ref={textareaRef}
            aria-label="Message"
            value={value}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-[13.5px] outline-none
              leading-6 min-h-[36px] max-h-[96px] text-slate-800
              placeholder:text-slate-400 disabled:opacity-40"
          />
        </div>

        {/* Send button */}
        <button
          onClick={submit}
          disabled={!canSend}
          aria-label="Send"
          className="shrink-0 w-9 h-9 rounded-full text-white flex items-center justify-center
            disabled:opacity-30 active:scale-95 transition-all duration-100
            hover:shadow-[0_4px_14px_rgba(37,99,235,0.4)]"
          style={{ background: canSend ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : '#94a3b8' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3.105 2.288a.75.75 0 00-.826.95l1.903 6.115a.75.75 0 00.608.509L11.5 10.5l-6.71.638a.75.75 0 00-.608.509L2.28 17.762a.75.75 0 00.826.95l15.5-7.5a.75.75 0 000-1.424l-15.5-7.5z" />
          </svg>
        </button>
      </div>

      {/* Keyboard hint — localized */}
      {!disabled && (
        <p className="text-[9.5px] mt-1 text-center hidden sm:block" style={{ color: '#cbd5e1' }}>
          {HINTS[lang] ?? HINTS['ru']}
        </p>
      )}
    </div>
  );
}
