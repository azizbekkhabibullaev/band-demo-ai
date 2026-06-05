/**
 * A/B Test: Whisper auto-detect vs language='kk' for Uzbek audio
 *
 * Tests BOTH conditions end-to-end:
 *   1. Raw Whisper transcript (no post-processing)
 *   2. GPT-normalized transcript
 *   3. GPT classification (category, summary, sentiment, isLead)
 *
 * Verdict: if 'kk' is not clearly better on all three dimensions,
 * recommendation = remove the kk mapping.
 */

import { readFile } from 'node:fs/promises';

const AUDIO = '/Users/azizbekkhabibullaev/Downloads/bank-chatbot-master/uploads/calls/1780575365860_Call_with_Miraziz_ZK.m4a';
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) { console.error('OPENAI_API_KEY not set'); process.exit(1); }

// ─── Whisper STT ──────────────────────────────────────────────────────────────

async function whisper(buffer, filename, langParam) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'audio/mp4' }), filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  if (langParam) form.append('language', langParam);   // omit = auto-detect

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
  const data = await res.json();

  // confidence from avg_logprob
  let confidence = 0.5;
  if (data.segments?.length > 0) {
    const avg = data.segments.reduce((s, x) => s + (x.avg_logprob ?? -0.5), 0) / data.segments.length;
    confidence = Math.max(0, Math.min(1, 1 + avg));
  }
  return { text: data.text?.trim() ?? '', detectedLang: data.language ?? '?', confidence };
}

// ─── GPT Uzbek normalizer ─────────────────────────────────────────────────────

async function normalize(rawText) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Siz o'zbek bank qo'ng'iroqlari transkriptlarini tahrirlovchi mutaxassississiz.
Kiritilgan matn Whisper STT tomonidan yaratilgan — qozog'cha yoki boshqa yozuvda bo'lishi mumkin.

Vazifangiz:
1. Matnni to'g'ri adabiy o'zbek tiliga o'tkazing (lotin yozuvida)
2. Bank terminlarini to'g'ri yozing: kredit, omonat, ipoteka, karta, foiz, to'lov, filial
3. Salomlashuvlarni to'g'ri yozing: Assalomu alaykum, Alaykum assalom
4. Har bir yangi gapirayotgan kishi yangi qatordan
5. To'g'ri tinish belgilari
6. MAZMUNNI O'ZGARTIRMANG
7. Faqat tayyor matnni qaytaring, izoh yozmang`,
        },
        { role: 'user', content: `Xom transkript:\n\n${rawText.slice(0, 5000)}` },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });
  const data = await res.json();
  return data.choices[0]?.message?.content?.trim() ?? rawText;
}

// ─── GPT classifier ───────────────────────────────────────────────────────────

async function classify(transcript) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Ты аналитик банковского контакт-центра. Верни строго JSON без объяснений.
{
  "summary": "краткое резюме 2-3 предложения на русском",
  "sentiment": "positive"|"neutral"|"negative",
  "category": "Вклады"|"Кредиты"|"Автокредиты"|"Ипотека"|"Карты"|"Мобильное приложение"|"Филиалы"|"Поддержка"|"Брокерские услуги"|"Жалобы"|"Другое",
  "subcategory": "конкретная подкатегория",
  "isLead": true/false,
  "leadScore": 0-100,
  "leadInterest": "продукт или пустая строка",
  "isComplaint": true/false
}`,
        },
        { role: 'user', content: `Транскрипт звонка:\n\n${transcript}` },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  });
  const data = await res.json();
  try { return JSON.parse(data.choices[0]?.message?.content ?? '{}'); }
  catch { return {}; }
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

const UZ_WORDS = [
  'assalomu','alaykum','kredit','ipoteka','bank','qanday','rahmat','yaxshi',
  "ma'lumot","to'lov","so'm",'filial','ariza','foiz','omonat','siz','men',
  "bo'ladi",'telefon','hujjat',
];

function score(text) {
  const lower = text.toLowerCase();
  const found = UZ_WORDS.filter(w => lower.includes(w));
  const readable = !/[А-Яа-яЁё]/.test(text); // no Cyrillic
  const noGibberish = !/sharcham|yapsen|tshemenge|odame ishte|mafchidam/i.test(text);
  return { found: found.length, total: UZ_WORDS.length, readable, noGibberish, words: found };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function line(c = '─', n = 72) { console.log(c.repeat(n)); }

async function main() {
  const buffer = await readFile(AUDIO);

  // ── Test A: auto-detect (no language param) ───────────────────────────────
  process.stdout.write('Test A: Whisper auto-detect (no language param)... ');
  const A_raw = await whisper(buffer, 'call.m4a', undefined);
  console.log(`detected="${A_raw.detectedLang}" confidence=${(A_raw.confidence*100).toFixed(1)}%`);

  process.stdout.write('Test A: GPT normalize... ');
  const A_norm = await normalize(A_raw.text);
  console.log('done');

  process.stdout.write('Test A: GPT classify... ');
  const A_cls = await classify(A_norm);
  console.log('done');

  await new Promise(r => setTimeout(r, 1000));

  // ── Test B: language='kk' (Kazakh proxy) ─────────────────────────────────
  process.stdout.write("Test B: Whisper language='kk' (Kazakh proxy)... ");
  const B_raw = await whisper(buffer, 'call.m4a', 'kk');
  console.log(`detected="${B_raw.detectedLang}" confidence=${(B_raw.confidence*100).toFixed(1)}%`);

  process.stdout.write('Test B: GPT normalize... ');
  const B_norm = await normalize(B_raw.text);
  console.log('done');

  process.stdout.write('Test B: GPT classify... ');
  const B_cls = await classify(B_norm);
  console.log('done');

  // ── Score ─────────────────────────────────────────────────────────────────
  const A_score = score(A_norm);
  const B_score = score(B_norm);

  // ── Report ────────────────────────────────────────────────────────────────

  console.log('\n');
  line('═');
  console.log('  A/B TEST RESULTS — UZBEK AUDIO — language=auto vs language=kk');
  line('═');

  // Stage 1: Raw Whisper
  console.log('\n── STAGE 1: RAW WHISPER OUTPUT ──');
  console.log(`\nTest A (auto):  detected="${A_raw.detectedLang}"  confidence=${(A_raw.confidence*100).toFixed(1)}%`);
  console.log(A_raw.text);
  console.log(`\nTest B (kk):    detected="${B_raw.detectedLang}"  confidence=${(B_raw.confidence*100).toFixed(1)}%`);
  console.log(B_raw.text);

  // Stage 2: Normalized
  console.log('\n── STAGE 2: AFTER GPT NORMALIZER ──');
  console.log('\nTest A (auto → normalized):');
  console.log(A_norm);
  console.log('\nTest B (kk → normalized):');
  console.log(B_norm);

  // Stage 3: Classification
  console.log('\n── STAGE 3: GPT CLASSIFICATION ──');
  console.log('\nTest A:');
  console.log(`  Summary   : ${A_cls.summary}`);
  console.log(`  Category  : ${A_cls.category} / ${A_cls.subcategory}`);
  console.log(`  Sentiment : ${A_cls.sentiment}`);
  console.log(`  Is Lead   : ${A_cls.isLead} (score: ${A_cls.leadScore})`);
  console.log(`  Interest  : ${A_cls.leadInterest}`);
  console.log('\nTest B:');
  console.log(`  Summary   : ${B_cls.summary}`);
  console.log(`  Category  : ${B_cls.category} / ${B_cls.subcategory}`);
  console.log(`  Sentiment : ${B_cls.sentiment}`);
  console.log(`  Is Lead   : ${B_cls.isLead} (score: ${B_cls.leadScore})`);
  console.log(`  Interest  : ${B_cls.leadInterest}`);

  // Verdict
  line('═');
  console.log('\n── OBJECTIVE SCORING ──\n');
  console.log(`Test A (auto) : ${A_score.found}/${A_score.total} Uzbek words | readable=${A_score.readable} | noGibberish=${A_score.noGibberish}`);
  console.log(`               words: ${A_score.words.join(', ')}`);
  console.log(`Test B (kk)   : ${B_score.found}/${B_score.total} Uzbek words | readable=${B_score.readable} | noGibberish=${B_score.noGibberish}`);
  console.log(`               words: ${B_score.words.join(', ')}`);

  const A_total = A_score.found + (A_score.readable ? 3 : 0) + (A_score.noGibberish ? 5 : 0);
  const B_total = B_score.found + (B_score.readable ? 3 : 0) + (B_score.noGibberish ? 5 : 0);

  line();
  if (B_total > A_total + 3) {
    console.log(`\n✅ VERDICT: kk IS BETTER (B=${B_total} vs A=${A_total})`);
    console.log('   Keep the uz→kk mapping.');
  } else if (A_total >= B_total) {
    console.log(`\n❌ VERDICT: kk IS NOT BETTER (A=${A_total} vs B=${B_total})`);
    console.log('   RECOMMENDATION: Remove the kk mapping.');
    console.log('   Use no language param. Apply normalizer regardless.');
  } else {
    console.log(`\n⚠️  VERDICT: MARGINAL DIFFERENCE (A=${A_total} vs B=${B_total})`);
    console.log('   Not enough to justify tricking Whisper into another language.');
    console.log('   RECOMMENDATION: Remove the kk mapping.');
  }
  line('═');
}

main().catch(err => { console.error(err); process.exit(1); });
