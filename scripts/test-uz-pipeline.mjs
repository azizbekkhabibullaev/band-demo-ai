/**
 * Manual pipeline test — runs one audio file through each stage and prints
 * BEFORE / AFTER comparison.
 *
 * Usage:
 *   node scripts/test-uz-pipeline.mjs <path-to-audio-file>
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const AUDIO_FILE = process.argv[2]
  ?? '/Users/azizbekkhabibullaev/Downloads/bank-chatbot-master/uploads/calls/1780575365860_Call_with_Miraziz_ZK.m4a';

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) { console.error('OPENAI_API_KEY not set'); process.exit(1); }

const sep = (label) => console.log(`\n${'─'.repeat(70)}\n  ${label}\n${'─'.repeat(70)}`);

// ─── STAGE 1: Whisper transcription (no language param — uz is unsupported) ──

async function stage1_whisper(buffer, filename) {
  sep('STAGE 1 — Whisper STT (auto-detect, no language= param)');

  const ext = filename.split('.').pop().toLowerCase();
  const mimeMap = { mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4', webm:'audio/webm',
                    mp4:'audio/mp4', ogg:'audio/ogg', flac:'audio/flac' };
  const mime = mimeMap[ext] ?? 'audio/wav';

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  // NOTE: no 'language' param — 'uz' is not a valid Whisper API parameter

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Whisper API ${res.status}: ${body}`);
  }

  const data = await res.json();

  // Language name → ISO code
  const LANG_MAP = { uzbek:'uz', russian:'ru', georgian:'ka', english:'en', kazakh:'kk',
                     turkish:'tr', arabic:'ar', tajik:'tg', azerbaijani:'az' };
  const rawName = (data.language ?? '').toLowerCase().trim();
  const isoCode = LANG_MAP[rawName] ?? rawName;

  // Confidence from segments
  let confidence = 0.5;
  if (data.segments?.length > 0) {
    const avgLP = data.segments.reduce((s, seg) => s + (seg.avg_logprob ?? -0.5), 0)
                  / data.segments.length;
    confidence = Math.max(0, Math.min(1, 1 + avgLP));
  }

  console.log(`Whisper detected language : "${rawName}"  →  ISO: "${isoCode}"`);
  console.log(`Confidence                : ${(confidence * 100).toFixed(1)}%`);
  console.log(`Duration                  : ${Math.round(data.duration ?? 0)}s`);
  console.log(`\nRAW WHISPER TRANSCRIPT:\n`);
  console.log(data.text);

  return { rawText: data.text, rawName, isoCode, confidence, duration: data.duration };
}

// ─── STAGE 2: Uzbek normalizer (GPT rewrite) ─────────────────────────────────

async function stage2_normalize(rawText) {
  sep('STAGE 2 — GPT Uzbek Normalizer');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Siz bank qo'ng'iroqlari transkriptlarini tahrirlovchi mutaxasssissiz.
Sizga telefon suhbatining xom matni beriladi — u avtomatik nutqni tanish tizimi (Whisper) tomonidan yaratilgan.

Vazifangiz:
1. Matnni to'g'ri adabiy o'zbek tiliga o'tkazing (lotin yozuvida)
2. Gaplar orasiga to'g'ri tinish belgilari qo'ying (nuqta, vergul, savol belgisi)
3. So'zlarni to'g'ri yozing: o'zbek → o'zbek, ko'proq → ko'proq, bo'ladi → bo'ladi
4. Har bir yangi gapirayotgan kishi uchun yangi qator boshlang
5. Mazmunni o'ZGARTIRMANG — faqat imlo va tinish belgilarini tuzating
6. Faqat tahrirlangan matnni qaytaring, hech qanday izoh yozmang`,
        },
        {
          role: 'user',
          content: `Xom transkript:\n\n${rawText.slice(0, 5000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GPT normalize API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const normalized = data.choices[0]?.message?.content?.trim() ?? '';

  console.log(`\nNORMALIZED TRANSCRIPT:\n`);
  console.log(normalized);

  return normalized.length > 20 ? normalized : rawText;
}

// ─── STAGE 3: GPT classification ─────────────────────────────────────────────

async function stage3_classify(transcript, language) {
  sep('STAGE 3 — GPT Classification');

  const SYSTEM_PROMPT = `Siz bank qo'ng'iroqlari tahlilchisisiz. Sizga telefon suhbatining transkribi beriladi.
Faqat JSON-obyekt qaytaring, hech qanday tushuntirish bermang.

JSON sxemasi:
{
  "summary": "2-4 jumlali qisqacha xulosa RUSCHA",
  "sentiment": "positive" | "neutral" | "negative",
  "sentimentScore": 0.0 dan 1.0 gacha,
  "category": "Вклады"|"Кредиты"|"Автокредиты"|"Ипотека"|"Карты"|"Мобильное приложение"|"Филиалы"|"Поддержка"|"Брокерские услуги"|"Жалобы"|"Другое",
  "subcategory": "aniq pastki kategoriya",
  "priority": "low"|"medium"|"high"|"critical",
  "topics": ["mavzu1","mavzu2"],
  "isLead": true/false,
  "leadScore": 0-100,
  "leadInterest": "mahsulot nomi yoki bo'sh qator",
  "isComplaint": true/false,
  "complaintNotes": "shikoyat yoki bo'sh qator"
}
Faqat JSON qaytaring.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Qo'ng'iroq transkribi:\n\n${transcript.slice(0, 6000)}` },
      ],
      temperature: 0.1,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    }),
  });

  const data = await res.json();
  const parsed = JSON.parse(data.choices[0]?.message?.content ?? '{}');

  console.log(`Summary      : ${parsed.summary}`);
  console.log(`Sentiment    : ${parsed.sentiment} (${parsed.sentimentScore})`);
  console.log(`Category     : ${parsed.category} / ${parsed.subcategory}`);
  console.log(`Priority     : ${parsed.priority}`);
  console.log(`Is Lead      : ${parsed.isLead} (score: ${parsed.leadScore})`);
  console.log(`Is Complaint : ${parsed.isComplaint}`);
  console.log(`Topics       : ${parsed.topics?.join(', ')}`);

  return parsed;
}

// ─── Run pipeline ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nTEST FILE: ${AUDIO_FILE}`);

  sep('BEFORE (stored in DB — old run)');
  console.log(`Language detected : "georgian" (WRONG — should be uzbek)`);
  console.log(`\nOLD RAW TRANSCRIPT (auto-detect wrongly identified as Georgian):\n`);
  console.log(
    'Assalamu alaikum Alaikum assalam, assalamu alaikum. ' +
    'Siz bilan ipoteka banka odame ishte? Damsen, sharcham yapsen ' +
    'Yakhsha, rahmat, uz yakhsham, sharcham yapsen Rahmat Khosh ' +
    'Man krizito mafchidam, basha, masadasi boi, tshemenge, tsheteri beralismu? ' +
    'Kanak krizitla ba, cut down tshum kere, online asam badadima? ' +
    'Sizgi kanak krizit turu kere, shu haqdi ko pro malamat beralismu? ' +
    'O zaman kanak krizit, kanak krizit, kanak krizit Birer krizi'
  );

  sep('RUNNING NEW PIPELINE');

  const buffer = await readFile(AUDIO_FILE);
  const filename = basename(AUDIO_FILE);

  // Stage 1
  const { rawText, rawName, isoCode, confidence, duration } = await stage1_whisper(buffer, filename);

  // Stage 2 — only if Uzbek
  let finalTranscript = rawText;
  if (isoCode === 'uz' || rawName === 'uzbek') {
    finalTranscript = await stage2_normalize(rawText);
  } else {
    console.log(`\nStage 2 skipped — language is "${rawName}", not Uzbek`);
  }

  // Stage 3
  await stage3_classify(finalTranscript, isoCode);

  sep('FINAL COMPARISON');
  console.log('\n📋 BEFORE (raw, wrongly detected as Georgian):\n');
  console.log(
    'Assalamu alaikum Alaikum assalam, assalamu alaikum. Siz bilan ipoteka banka\n' +
    'odame ishte? Damsen, sharcham yapsen Yakhsha, rahmat, uz yakhsham,\n' +
    'sharcham yapsen Rahmat Khosh Man krizito mafchidam, basha, masadasi boi,\n' +
    'tshemenge, tsheteri beralismu? Kanak krizitla ba, cut down tshum kere...'
  );
  console.log('\n✅ AFTER (auto-detect + GPT normalizer):\n');
  console.log(finalTranscript);
  console.log(`\nConfidence: ${(confidence * 100).toFixed(1)}%  |  Detected: "${rawName}" → "${isoCode}"`);
}

main().catch(err => { console.error(err); process.exit(1); });
