import type { Lang } from '@bank-chatbot/shared';

const RU_EXCLUSIVE = /[ёЁъЪыЫэЭ]/;

function countCyrillic(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x0400 && cp <= 0x04FF) n++;
  }
  return n;
}

const UZ_SPECIFIC = /\b(va|bu|men|siz|biz|ular|ham|uchun|bilan|nima|qanday|qancha|qaysi|lekin|yoki|agar|kerak|ishlaydi|qiling|boring|bering|rahmat|xayr|salom|assalomu|yaxshi|tayyorman|filial|foiz|stavka|muddat|ilova|muammo|shikoyat|xizmat|yordam|hisob|pul|karta|kredit|qo'ng'iring|o'zbek|tashkent|olmoqchiman|krediti|stavkasi)\b/gi;

const RU_WORDS = /\b(и|в|на|за|не|как|что|мне|вам|вы|это|банк|карта|счёт|кредит|деньги|пожалуйста|привет|здравствуйте|моя|мой|моё|заблокирована|хочу|нужно|можно|сегодня|какой|курс|ставка|открыть|подать|жалоба|взять)\b/gi;

const EN_WORDS = /\b(the|and|is|are|was|were|what|how|do|my|your|i|you|please|thank|hello|hi|good|loan|account|money|transfer|balance|block|open|exchange|interest|deposit|branch|help|need|want|would|could|today|rate|dollar|complaint|file|submit|tell|can|show|me|to|like)\b/gi;

function score(text: string, regex: RegExp): number {
  return (text.match(regex) || []).length;
}

export function detectLanguage(text: string): Lang {
  if (!text || !text.trim()) return 'ru';
  const t = text.trim();

  const cyrCount = countCyrillic(t);
  const totalChars = t.replace(/\s/g, '').length || 1;
  const cyrRatio = cyrCount / totalChars;

  if (cyrRatio > 0.3) {
    if (RU_EXCLUSIVE.test(t)) return 'ru';
    if (score(t, RU_WORDS) > 0) return 'ru';
    return 'ru';
  }

  if (cyrRatio < 0.1) {
    const uz = score(t, UZ_SPECIFIC);
    const en = score(t, EN_WORDS);
    if (uz === 0 && en === 0) {
      if (/o[`'ʼ'']|g[`'ʼ'']/i.test(t)) return 'uz';
      return 'ru';
    }
    if (uz > en) return 'uz';
    if (en > uz) return 'en';
    if (/o[`'ʼ'']|g[`'ʼ'']/i.test(t)) return 'uz';
    return 'ru';
  }

  const ru = score(t, RU_WORDS);
  const uz = score(t, UZ_SPECIFIC);
  const en = score(t, EN_WORDS);
  const max = Math.max(ru, uz, en);
  if (max === 0 || ru === max) return 'ru';
  if (uz > en) return 'uz';
  return 'en';
}
