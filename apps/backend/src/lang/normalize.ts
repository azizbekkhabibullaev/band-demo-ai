// Uzbek Cyrillic → Latin transliteration map
const CYR_TO_LAT: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z',
  'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
  'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh',
  'ъ': "'", 'ы': 'i', 'ь': "'", 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'ғ': "g'", 'қ': 'q', 'ҳ': 'h', 'ӯ': "o'", 'ў': "o'", 'ҷ': 'j',
  // uppercase
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'J', 'З': 'Z',
  'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R',
  'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'X', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sh',
  'Ъ': "'", 'Ы': 'I', 'Ь': "'", 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
  'Ғ': "G'", 'Қ': 'Q', 'Ҳ': 'H', 'Ӯ': "O'", 'Ў': "O'", 'Ҷ': 'J',
};

export function normalizeCyrillicUz(text: string): string {
  // Detect if this looks like Uzbek Cyrillic (has ғ,қ,ҳ,ӯ,ў chars, or typical Cyrillic but no Russian-exclusive letters)
  return text.split('').map(c => CYR_TO_LAT[c] ?? c).join('');
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''ʼ`]/g, "'")   // normalize apostrophes
    .replace(/\s+/g, ' ')
    .trim();
}

// Synonyms for banking terms (uz/ru equivalents)
const BANKING_SYNONYMS: Record<string, string[]> = {
  'kredit': ['кредит', 'credit', 'qarz', 'ssuda', 'займ'],
  'karta': ['карта', 'card', 'plastik', 'uzcard', 'humo', 'visa'],
  'pul': ['деньги', 'money', 'mablag', 'nalichka'],
  'blok': ['блок', 'blokirovka', 'freeze'],
  'bank': ['банк', 'ipoteka'],
  'ariza': ['заявка', 'aplication', 'application'],
  'foiz': ['процент', 'percent', 'stavka', 'stavkasi'],
  'muddat': ['срок', 'muddati', 'period'],
  'tolov': ["to'lov", 'платеж', 'payment', 'oplata'],
};

export function expandSynonyms(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const [key, syns] of Object.entries(BANKING_SYNONYMS)) {
      if (token === key || syns.includes(token)) {
        expanded.add(key);
        syns.forEach(s => expanded.add(s));
      }
    }
  }
  return Array.from(expanded);
}
