import { useEffect, useState } from 'react';

const THINKING_MESSAGES: Record<string, string[]> = {
  uz: [
    'Tahlil qilinmoqda…',
    'Eng yaxshi variantlar izlanmoqda…',
    'Bank ma\'lumotlari tekshirilmoqda…',
    'Tayyorlanmoqda…',
  ],
  ru: [
    'Анализирую запрос…',
    'Ищу лучшие варианты…',
    'Проверяю банковские данные…',
    'Подготавливаю ответ…',
  ],
  en: [
    'Analyzing your request…',
    'Finding the best options…',
    'Checking banking data…',
    'Preparing answer…',
  ],
};

interface Props {
  lang?: string;
}

export function TypingIndicator({ lang = 'ru' }: Props) {
  const msgs = THINKING_MESSAGES[lang] ?? THINKING_MESSAGES['ru']!;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % msgs.length), 2200);
    return () => clearInterval(t);
  }, [msgs.length]);

  return (
    <div className="flex justify-start mb-3 gap-2 items-end msg-in">
      {/* AI avatar */}
      <div className="w-7 h-7 rounded-full shrink-0 mb-0.5 flex items-center justify-center shadow-sm"
        style={{ background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)' }}>
        <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
          <path d="M8 2L9.5 6.5H14L10.5 9L11.5 13.5L8 11L4.5 13.5L5.5 9L2 6.5H6.5L8 2Z"
            fill="white" fillOpacity="0.9" />
        </svg>
      </div>

      {/* Bubble */}
      <div className="bg-white ring-1 ring-slate-200/80 rounded-2xl rounded-bl-sm
        px-3.5 py-2.5 flex items-center gap-3 shadow-sm max-w-[75%]">
        {/* Dots */}
        <div className="flex gap-1 items-center">
          {([0, 1, 2] as const).map((i: number) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-blue-400"
              style={{ animation: `typing-bounce 1.2s ease-in-out infinite`, animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
        {/* Contextual message */}
        <span className="text-[11.5px] text-slate-400 font-medium transition-all duration-300">
          {msgs[idx]}
        </span>
      </div>
    </div>
  );
}
