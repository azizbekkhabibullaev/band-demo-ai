/**
 * Final pipeline test with kk-proxy strategy.
 * Shows BEFORE / AFTER / NORMALIZED side by side.
 */
import { readFile } from 'node:fs/promises';

const AUDIO = '/Users/azizbekkhabibullaev/Downloads/bank-chatbot-master/uploads/calls/1780575365860_Call_with_Miraziz_ZK.m4a';
const API_KEY = process.env.OPENAI_API_KEY;

const BEFORE_TRANSCRIPT =
  'Assalamu alaikum Alaikum assalam, assalamu alaikum. ' +
  'Siz bilan ipoteka banka odame ishte? Damsen, sharcham yapsen ' +
  'Yakhsha, rahmat, uz yakhsham, sharcham yapsen Rahmat Khosh ' +
  'Man krizito mafchidam, basha, masadasi boi, tshemenge, tsheteri beralismu? ' +
  'Kanak krizitla ba, cut down tshum kere, online asam badadima? ' +
  'Sizgi kanak krizit turu kere, shu haqdi ko pro malamat beralismu? ' +
  'O zaman kanak krizit, kanak krizit, kanak krizit Birer krizi';

async function whisperKk(buffer, filename) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'audio/mp4' }), filename);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('language', 'kk');   // Kazakh proxy — highest confidence for Uzbek audio

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${await res.text()}`);
  const data = await res.json();

  let confidence = 0.5;
  if (data.segments?.length > 0) {
    const avg = data.segments.reduce((s, x) => s + (x.avg_logprob ?? -0.5), 0) / data.segments.length;
    confidence = Math.max(0, Math.min(1, 1 + avg));
  }
  return { text: data.text?.trim(), whisperLang: data.language, confidence, duration: data.duration };
}

async function normalizeUzbek(rawText) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Siz o'zbek bank qo'ng'iroqlari transkriptlarini tahrirlovchi mutaxassississiz.

Muhim: Kiritilgan matn avtomatik nutqni tanish (Whisper STT) tomonidan yaratilgan va qozog'cha yoki boshqa turkiy tildagi fonetik yozuv bo'lishi mumkin, chunki Whisper o'zbek tilini qozog'cha sifatida taniydi.

Vazifangiz:
1. Matnni to'liq o'qib, bank suhbatining ma'nosini tushunib oling
2. Matnni to'g'ri adabiy o'zbek tiliga tarjima yoki o'tkazing — LOTIN YOZUVIDA
3. Bank kontekstida to'g'ri terminlarni ishlating:
   - kredit, omonat, ipoteka, karta, foiz, muddati, to'lov, filial, ariza
4. Salomlashuvlarni to'g'ri yozing: Assalomu alaykum, Alaykum assalom
5. Har bir yangi gapirayotgan kishi yangi qatordan boshlaydi
6. To'g'ri tinish belgilari qo'ying (nuqta, vergul, savol belgisi)
7. To'g'ri apostroflar: o'zbek, ko'proq, bo'ladi, qanday, ma'lumot, so'm, to'lov
8. MAZMUNNI O'ZGARTIRMANG — faqat til va imlo

Faqat tayyor o'zbek matnini qaytaring. Hech qanday izoh yozmang.`,
        },
        {
          role: 'user',
          content: `Xom transkript (Whisper STT, ehtimol qozog'cha yozuvda):\n\n${rawText.slice(0, 5000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });
  const data = await res.json();
  return data.choices[0]?.message?.content?.trim() ?? rawText;
}

const line = (c = '─', n = 70) => console.log(c.repeat(n));

async function main() {
  const buffer = await readFile(AUDIO);

  line('═');
  console.log('  UZBEK TRANSCRIPTION — BEFORE vs AFTER');
  line('═');

  console.log('\n📋 BEFORE (auto-detect, old pipeline):');
  console.log(`   Whisper detected language: "georgian"  (WRONG)`);
  console.log(`   Confidence: ~30%\n`);
  console.log(BEFORE_TRANSCRIPT);

  line();
  console.log('\n⚙️  Running new pipeline (language=kk proxy + GPT normalizer)...\n');

  // Stage 1: Whisper with kk proxy
  const { text: rawKk, whisperLang, confidence, duration } = await whisperKk(buffer, 'call.m4a');

  console.log(`\n📡 STAGE 1 — Whisper STT (language=kk proxy)`);
  console.log(`   Whisper detected: "${whisperLang}"  |  confidence: ${(confidence*100).toFixed(1)}%  |  duration: ${Math.round(duration ?? 0)}s`);
  console.log(`\n   RAW WHISPER OUTPUT (Cyrillic Kazakh phonetics):\n`);
  console.log(rawKk);

  // Stage 2: GPT normalizer
  console.log(`\n📝 STAGE 2 — GPT Uzbek Normalizer`);
  console.log(`   Converting Cyrillic Kazakh-phonetic → literary Uzbek (Latin)...\n`);
  const normalized = await normalizeUzbek(rawKk);

  line('═');
  console.log('\n✅ FINAL COMPARISON\n');
  line();
  console.log('BEFORE  (old — auto-detect → Georgian → phonetic gibberish):');
  line();
  console.log(BEFORE_TRANSCRIPT);
  line();
  console.log('\nAFTER   (new — kk proxy → GPT normalizer → literary Uzbek):');
  line();
  console.log(normalized);
  line('═');

  // Quality assessment
  const uzbekWords = ['assalomu','alaykum','kredit','ipoteka','bank','qanday',
                      'rahmat','yaxshi','salom','ma\'lumot','to\'lov','so\'m',
                      'filial','ariza','foiz','omonat','siz','men','bo\'ladi'];
  const found = uzbekWords.filter(w => normalized.toLowerCase().includes(w));
  console.log(`\n📊 Quality check: ${found.length}/${uzbekWords.length} expected Uzbek words found`);
  console.log(`   Found: ${found.join(', ')}`);
  console.log(`\n   Confidence: ${(confidence*100).toFixed(1)}%`);
  console.log(`   Result: ${found.length >= 5 ? '✅ PASS — readable literary Uzbek' : '❌ FAIL — still poor quality'}`);
}

main().catch(err => { console.error(err); process.exit(1); });
