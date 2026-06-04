/**
 * Test multiple language codes for this audio file to find which produces
 * the best Uzbek-like transcript.
 *
 * Tests: auto, tr (Turkish), az (Azerbaijani), kk (Kazakh)
 * All three are Turkic languages officially supported by Whisper.
 */

import { readFile } from 'node:fs/promises';

const AUDIO_FILE = '/Users/azizbekkhabibullaev/Downloads/bank-chatbot-master/uploads/calls/1780575365860_Call_with_Miraziz_ZK.m4a';
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) { console.error('OPENAI_API_KEY not set'); process.exit(1); }

const MIMES = { m4a:'audio/mp4', mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg' };

async function transcribe(buffer, filename, language) {
  const ext = filename.split('.').pop().toLowerCase();
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: MIMES[ext] ?? 'audio/mp4' }), filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  if (language) form.append('language', language);

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    return { error: `${res.status}: ${body}`, text: null, language: null, confidence: 0 };
  }
  const data = await res.json();

  let confidence = 0.5;
  if (data.segments?.length > 0) {
    const avgLP = data.segments.reduce((s, seg) => s + (seg.avg_logprob ?? -0.5), 0)
                  / data.segments.length;
    confidence = Math.max(0, Math.min(1, 1 + avgLP));
  }
  return { text: data.text?.trim(), language: data.language, confidence };
}

async function normalize(rawText) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Siz bank qo'ng'iroqlari transkriptlarini tahrirlovchi mutaxassississiz.
Sizga telefon suhbatining xom matni beriladi.

Vazifangiz:
1. Matnni to'g'ri adabiy o'zbek tiliga o'tkazing (lotin yozuvida)
2. Gaplar orasiga to'g'ri tinish belgilari qo'ying
3. So'zlarni to'g'ri yozing: o'zbek, ko'proq, bo'ladi, qanday, kredit
4. Har bir yangi gapirayotgan kishi uchun yangi qator boshlang
5. Mazmunni o'ZGARTIRMANG
6. Faqat tahrirlangan matnni qaytaring`,
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

async function main() {
  const buffer = await readFile(AUDIO_FILE);

  const tests = [
    { lang: undefined, label: 'auto   (no language param)' },
    { lang: 'tr',      label: 'tr     (Turkish — Turkic family)' },
    { lang: 'az',      label: 'az     (Azerbaijani — Turkic family)' },
    { lang: 'kk',      label: 'kk     (Kazakh — Turkic family)' },
  ];

  const results = [];

  for (const { lang, label } of tests) {
    process.stdout.write(`Testing ${label}... `);
    const r = await transcribe(buffer, 'test.m4a', lang);
    if (r.error) {
      console.log(`ERROR: ${r.error}`);
      results.push({ label, ...r });
    } else {
      console.log(`detected="${r.language}" confidence=${(r.confidence*100).toFixed(1)}%`);
      results.push({ label, ...r });
    }
    // Small pause between requests
    await new Promise(r => setTimeout(r, 800));
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  TRANSCRIPTS BY LANGUAGE OPTION');
  console.log('═'.repeat(70));

  for (const r of results) {
    console.log(`\n─── ${r.label} ───`);
    if (r.error) { console.log(`ERROR: ${r.error}`); continue; }
    console.log(`Whisper detected: "${r.language}" | confidence: ${(r.confidence*100).toFixed(1)}%`);
    console.log(`\n${r.text}\n`);
  }

  // Find best candidate (highest confidence, non-Georgian detection)
  const scored = results.filter(r => !r.error).map(r => ({
    ...r,
    // penalize Georgian detection (it means wrong language model)
    score: r.confidence * (r.language === 'georgian' ? 0.3 : 1.0),
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  console.log('═'.repeat(70));
  console.log(`\n✅ BEST OPTION: ${best.label}`);
  console.log(`   Detected: "${best.language}" | Confidence: ${(best.confidence*100).toFixed(1)}%`);
  console.log('\nRaw transcript:');
  console.log(best.text);

  // Run normalizer on best option
  console.log('\n' + '─'.repeat(70));
  console.log('  NORMALIZED (GPT)');
  console.log('─'.repeat(70));
  const normalized = await normalize(best.text);
  console.log(normalized);

  console.log('\n' + '═'.repeat(70));
  console.log('  RECOMMENDATION');
  console.log('═'.repeat(70));
  console.log(`Use language='${best.label.split(' ')[0]}' when hint is 'uz'`);
}

main().catch(err => { console.error(err); process.exit(1); });
