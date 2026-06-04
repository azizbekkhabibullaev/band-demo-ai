#!/usr/bin/env node
/**
 * QA: Create 5 sample call records directly in the DB with realistic transcripts.
 *
 * This bypasses the audio upload pipeline and inserts completed call records
 * so the dashboard can be verified immediately without real audio files.
 *
 * Also generates 5 minimal silent WAV files in /qa-audio/ for upload testing.
 *
 * Usage:
 *   /Users/azizbekkhabibullaev/.nvm/versions/node/v20.20.2/bin/node scripts/create-sample-calls.mjs
 */

import { readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load env ──────────────────────────────────────────────────────────────────
const envPath = join(ROOT, 'apps/backend/.env');
let DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^DATABASE_URL=(.+)$/);
      if (m) { DATABASE_URL = m[1].trim(); break; }
    }
  } catch { /* env file not found */ }
}
if (!DATABASE_URL) {
  DATABASE_URL = 'postgres://chatbot:chatbot@localhost:5432/chatbot';
}

// ── Sample call data ──────────────────────────────────────────────────────────

const SAMPLE_CALLS = [
  {
    filename:         '01_deposit_inquiry.wav',
    duration_seconds: 187,
    language:         'ru',
    transcript: `Оператор: Здравствуйте, Ипотека Банк, чем могу помочь?
Клиент: Добрый день. Я хотел бы узнать про ваши вклады. Слышал, что у вас есть депозит с процентной ставкой 20% годовых. Это правда?
Оператор: Да, совершенно верно. У нас есть срочный вклад "Максимальный доход" со ставкой 19.5% годовых при сроке от 12 месяцев.
Клиент: Отлично. А какая минимальная сумма? Я думаю разместить около 10 миллионов сум.
Оператор: Минимальная сумма — 1 миллион сум. Для суммы 10 миллионов вы получите 1.95 миллиона сум дохода за год.
Клиент: Звучит хорошо. Можно ли сделать капитализацию процентов?
Оператор: Да, вы можете выбрать ежемесячную выплату или капитализацию. При капитализации эффективная ставка будет 21.4%.
Клиент: Превосходно! Хочу открыть. Что мне нужно принести?
Оператор: Паспорт и любую карту банка для пополнения. Оформить можно в любом отделении или через мобильное приложение.
Клиент: Спасибо большое, всё понятно!`,
    summary:       'Клиент интересуется срочным вкладом "Максимальный доход" с высокой процентной ставкой. Планирует разместить 10 млн сум. Проявляет высокий интерес к открытию вклада с капитализацией. Настроен позитивно, готов к открытию.',
    sentiment:     'positive',
    sentiment_score: 0.92,
    category:      'Вклады',
    subcategory:   'Вклад 20% / Максимальный доход',
    priority:      'medium',
    topics:        ['вклад', 'процентная ставка', 'капитализация', 'открытие депозита'],
    is_lead:       true,
    lead_score:    85,
    lead_interest: 'Вклады',
    is_complaint:  false,
    complaint_notes: '',
  },
  {
    filename:         '02_auto_loan_request.wav',
    duration_seconds: 243,
    language:         'ru',
    transcript: `Оператор: Ипотека Банк, добрый день!
Клиент: Привет. Мне нужен автокредит. Хочу купить Chevrolet Equinox, стоит около 250 миллионов. У вас есть такой кредит?
Оператор: Да, у нас есть программа "Авто в рассрочку" с первоначальным взносом от 20%.
Клиент: То есть мне нужно 50 миллионов своих? А на сколько лет можно взять?
Оператор: До 5 лет. Ставка от 18% годовых в зависимости от срока и первоначального взноса.
Клиент: Хорошо. А если я сделаю взнос 30%, ставка будет ниже?
Оператор: Да, при взносе 30% и выше ставка снизится до 16.5% годовых.
Клиент: Отлично. Я хочу взять. Что нужно для одобрения?
Оператор: Паспорт, справка о доходах за последние 6 месяцев, и контактные данные. Могу записать вас на встречу с кредитным специалистом.
Клиент: Запишите пожалуйста. Меня зовут Камолиддин, телефон 90-123-45-67.
Оператор: Отлично, Камолиддин! Записал вас на завтра в 10:00.`,
    summary:       'Клиент Камолиддин активно запрашивает автокредит на покупку Chevrolet Equinox стоимостью 250 млн сум. Обсудили условия: взнос 30%, срок до 5 лет, ставка 16.5%. Клиент оставил телефон и записался на встречу. Горячий лид — высокий потенциал конверсии.',
    sentiment:     'positive',
    sentiment_score: 0.88,
    category:      'Автокредиты',
    subcategory:   'Chevrolet / Авто в рассрочку',
    priority:      'high',
    topics:        ['автокредит', 'Chevrolet Equinox', 'первоначальный взнос', 'запись на встречу'],
    is_lead:       true,
    lead_score:    96,
    lead_interest: 'Автокредиты',
    is_complaint:  false,
    complaint_notes: '',
  },
  {
    filename:         '03_mobile_app_complaint.wav',
    duration_seconds: 312,
    language:         'ru',
    transcript: `Оператор: Ипотека Банк, слушаю вас.
Клиент: Здравствуйте. Я в очень плохом настроении. Уже третий день не могу войти в ваше мобильное приложение! Это просто безобразие!
Оператор: Понимаю ваше недовольство. Расскажите подробнее, что происходит?
Клиент: Ввожу логин и пароль — приложение просто зависает на экране загрузки! Потом вылетает. Я не могу посмотреть баланс, не могу сделать перевод. Три дня без доступа к деньгам!
Оператор: Очень сожалею о неудобствах. Какой у вас телефон и версия приложения?
Клиент: iPhone 13, iOS 17. Последняя версия приложения, я обновил вчера. После обновления ещё хуже стало!
Оператор: Спасибо за информацию. Мы фиксируем жалобу. Попробуйте удалить приложение и установить заново — это должно помочь. Также рекомендую очистить кэш перед переустановкой.
Клиент: Я уже пробовал переустанавливать! Не помогает. Это ваша проблема, а не моя!
Оператор: Совершенно верно, примите извинения. Я передаю ваш случай в технический отдел как приоритетный. Вам позвонят в течение 24 часов.
Клиент: Ладно. Жду.`,
    summary:       'Клиент жалуется на критическую проблему: приложение зависает и вылетает при входе после последнего обновления (iOS 17, iPhone 13). Проблема длится три дня. Клиент раздражён, обычные решения (переустановка) не помогли. Требует срочного вмешательства технического отдела.',
    sentiment:     'negative',
    sentiment_score: 0.12,
    category:      'Мобильное приложение',
    subcategory:   'Приложение зависает после обновления / iOS',
    priority:      'critical',
    topics:        ['мобильное приложение', 'зависание', 'iOS 17', 'невозможность войти', 'жалоба'],
    is_lead:       false,
    lead_score:    0,
    lead_interest: '',
    is_complaint:  true,
    complaint_notes: 'Приложение зависает на экране загрузки после обновления. iPhone 13, iOS 17. Переустановка не помогла. Проблема продолжается 3 дня.',
  },
  {
    filename:         '04_branch_complaint.wav',
    duration_seconds: 198,
    language:         'ru',
    transcript: `Оператор: Ипотека Банк, добрый день.
Клиент: Здравствуйте. Хочу подать жалобу на ваш филиал на Мирзо Улугбека.
Оператор: Конечно, слушаю вас внимательно.
Клиент: Я пришёл открыть счёт. Простая операция! Но сотрудник по имени Шохрух был груб и невнимателен. Заставил ждать 40 минут без объяснений, потом сказал что нужен ещё один документ которого у меня не было с собой. Это нигде не написано на сайте!
Оператор: Приносим свои извинения. Это недопустимое поведение.
Клиент: И ещё — в зале ожидания нет кондиционера! В такую жару это просто невозможно.
Оператор: Понял, фиксирую обе жалобы: поведение сотрудника и условия в отделении. Номер вашей жалобы — 2024-0847. Руководитель филиала свяжется с вами в течение 48 часов.
Клиент: Хорошо, жду.`,
    summary:       'Клиент жалуется на грубое обслуживание сотрудника Шохрух в филиале на Мирзо Улугбека: 40-минутное ожидание без объяснений, неполный список необходимых документов на сайте. Дополнительная жалоба — отсутствие кондиционера. Зафиксирован как приоритетный случай.',
    sentiment:     'negative',
    sentiment_score: 0.18,
    category:      'Филиалы',
    subcategory:   'Грубое обслуживание / Условия в отделении',
    priority:      'high',
    topics:        ['жалоба на сотрудника', 'Мирзо Улугбек', 'долгое ожидание', 'некорректная информация'],
    is_lead:       false,
    lead_score:    0,
    lead_interest: '',
    is_complaint:  true,
    complaint_notes: 'Грубость сотрудника Шохрух, ожидание 40 минут без объяснений. Неполный список документов на сайте. Нет кондиционера в зале ожидания.',
  },
  {
    filename:         '05_brokerage_inquiry.wav',
    duration_seconds: 276,
    language:         'ru',
    transcript: `Оператор: Ипотека Банк, добрый день!
Клиент: Здравствуйте. Я хочу узнать о ваших брокерских услугах. Мне интересно инвестировать в акции узбекских компаний.
Оператор: Отличный вопрос! У нас есть брокерский счёт на платформе UzEx. Вы можете торговать акциями, облигациями и другими инструментами Узбекской биржи.
Клиент: Какая комиссия за операции?
Оператор: Комиссия брокера — 0.1% от суммы сделки, минимум 500 сум. Плюс биржевой сбор 0.05%.
Клиент: Понятно. А какой минимальный депозит для начала?
Оператор: Минимального депозита нет. Можно начать с любой суммы. Рекомендуем от 1-2 миллионов для диверсификации.
Клиент: Хорошо. Как я могу открыть брокерский счёт?
Оператор: Через наш офис инвестиций или онлайн через приложение в разделе "Инвестиции". Потребуется паспорт и ИНН.
Клиент: Отлично. Буду думать. Спасибо за информацию.
Оператор: Пожалуйста! Если решитесь, наш инвестиционный консультант всегда готов помочь выбрать стратегию.`,
    summary:       'Клиент проявляет интерес к брокерским услугам — инвестированию в акции узбекских компаний через UzEx. Уточнил комиссии (0.1% + 0.05%) и процедуру открытия счёта. Настроен нейтрально-позитивно, находится на стадии принятия решения.',
    sentiment:     'neutral',
    sentiment_score: 0.65,
    category:      'Брокерские услуги',
    subcategory:   'Открытие брокерского счёта / UzEx',
    priority:      'medium',
    topics:        ['брокерский счёт', 'акции', 'UzEx', 'инвестиции', 'комиссия'],
    is_lead:       true,
    lead_score:    72,
    lead_interest: 'Брокерские услуги',
    is_complaint:  false,
    complaint_notes: '',
  },

  // ── Uzbek test cases ── (language='uz', normalized transcript) ──────────────

  {
    filename:         '06_uz_kredit_sorov.wav',
    duration_seconds: 215,
    language:         'uz',
    transcript: `Operator: Assalomu alaykum. Ipoteka Bank, sizga qanday yordam bera olaman?
Mijoz: Salom. Men kredit olmoqchi edim. Avtokredit bo'yicha ma'lumot olsam bo'ladimi?
Operator: Albatta. Qaysi avtomobil uchun kredit olmoqchisiz?
Mijoz: Nexia 3 olmoqchiman. Narxi taxminan 80 million so'm.
Operator: Juda yaxshi. Bizda boshlang'ich to'lov 20 foizdan boshlanadi. 80 millionning 20 foizi — 16 million so'm.
Mijoz: Tushunarli. Foiz stavkasi qancha?
Operator: Yiliga 18 foiz. 5 yilga olinsa, oylik to'lov taxminan 1.8 million so'm bo'ladi.
Mijoz: Hujjatlar kerak bo'ladimi?
Operator: Ha. Pasport, 6 oylik daromad ma'lumoti va avtomobil oldi-sotdi shartnomasi.
Mijoz: Mayli. Ertaga filialga kelishim mumkinmi?
Operator: Albatta, istalgan filialimizga tashrif buyurishingiz mumkin. Murojaat raqamingiz: 2024-KR-1892.`,
    summary:       'Клиент интересуется автокредитом на Nexia 3 (80 млн сум). Обсудили условия: первоначальный взнос 20% (16 млн), ставка 18%, срок 5 лет, ежемесячный платёж ~1.8 млн. Клиент планирует прийти в филиал завтра. Высокая вероятность конверсии.',
    sentiment:     'positive',
    sentiment_score: 0.84,
    category:      'Автокредиты',
    subcategory:   'Nexia 3 / Avtokredit 18%',
    priority:      'high',
    topics:        ['avtokredit', 'Nexia 3', 'boshlang\'ich to\'lov', 'filial tashrifi'],
    is_lead:       true,
    lead_score:    91,
    lead_interest: 'Автокредиты',
    is_complaint:  false,
    complaint_notes: '',
  },
  {
    filename:         '07_uz_omonat_sorov.wav',
    duration_seconds: 178,
    language:         'uz',
    transcript: `Operator: Assalomu alaykum! Ipoteka Bank.
Mijoz: Alaykum assalom. Omonat qo'ymoqchi edim. Eng yuqori foizli omonat qaysi?
Operator: Bizda "Maksimal daromad" omonati bor — yiliga 19.5 foiz, 12 oyga.
Mijoz: Minimal summa qancha?
Operator: Minimal 1 million so'mdan. Siz qancha qo'ymoqchisiz?
Mijoz: 15 million so'm bor. Foizlar oyma-oy to'lanadimi?
Operator: Ha, oyiga bir marta hisobingizga o'tkaziladi. Yoki kapitallashtirish ham tanlasa bo'ladi — bu holda yillik effektiv stavka 21.4 foizgacha yetadi.
Mijoz: Kapitallashtirish qiziq. Qanday qilib rasmiylashtiraman?
Operator: Istalgan filialimizga pasportingiz bilan keling yoki ilovamiz orqali online rasmiylashtiring.
Mijoz: Rahmat, tushundim. Ko'rib chiqaman.`,
    summary:       'Клиент из Узбекистана интересуется вкладом с высокой процентной ставкой. Рассмотрел "Максимальный доход" — 19.5% годовых, сумма 15 млн сум. Заинтересован в капитализации (21.4% эффективная ставка). Клиент обдумывает решение, вероятность конверсии средняя.',
    sentiment:     'neutral',
    sentiment_score: 0.70,
    category:      'Вклады',
    subcategory:   "Maksimal daromad omonati / 19.5%",
    priority:      'medium',
    topics:        ['omonat', 'foiz stavkasi', 'kapitalizatsiya', 'Maksimal daromad'],
    is_lead:       true,
    lead_score:    74,
    lead_interest: 'Вклады',
    is_complaint:  false,
    complaint_notes: '',
  },
  {
    filename:         '08_uz_ilova_shikoyat.wav',
    duration_seconds: 264,
    language:         'uz',
    transcript: `Operator: Assalomu alaykum, Ipoteka Bank.
Mijoz: Salom. Men juda xafa bo'ldim. Ilovangiz uch kundan beri ishlamayapti!
Operator: Uzr so'raymiz. Nima muammo bo'lyapti?
Mijoz: Login va parolni kiritaman — ilova yuklash ekranida qotib qoladi. So'ngra yopiladi. Pullarimga kira olmayapman!
Operator: Telefon turingiz va iOS versiyasi nima?
Mijoz: iPhone 14, iOS 17.4. Kecha yangiladim — undan keyin ham ishlamayapti.
Operator: Tushundim. Bu muammo haqida texnik bo'limga ma'lum qilingan. Ilovani o'chib qayta o'rnating.
Mijoz: O'chirib qayta o'rnatdim — yordam bermadi!
Operator: Kechirasiz. Sizning murojaat raqamingiz: TK-2024-0391. Texnik mutaxassis 24 soat ichida qo'ng'iroq qiladi.
Mijoz: Yaxshi, kutaman. Lekin tezroq hal qiling iltimos.`,
    summary:       'Клиент жалуется на критическую неисправность мобильного приложения — зависает на экране загрузки после обновления iOS 17.4 (iPhone 14). Приложение не запускается три дня. Переустановка не помогла. Зарегистрирован тикет TK-2024-0391, техник позвонит в течение 24 часов.',
    sentiment:     'negative',
    sentiment_score: 0.14,
    category:      'Мобильное приложение',
    subcategory:   'Ilova ishlamayapti / iOS 17.4 yangilanishidan keyin',
    priority:      'critical',
    topics:        ['ilova', 'iOS 17', 'login muammosi', 'shikoyat', 'texnik xato'],
    is_lead:       false,
    lead_score:    0,
    lead_interest: '',
    is_complaint:  true,
    complaint_notes: "Ilova iOS 17.4 yangilanishidan keyin ishlamayapti. iPhone 14. Qayta o'rnatish yordam bermadi. 3 kun muammo davom etmoqda.",
  },
];

// ── Generate silent WAV helper ─────────────────────────────────────────────────

function makeSilentWav(durationSecs = 1, sampleRate = 8000) {
  const numChannels  = 1;
  const bitsPerSample = 16;
  const numSamples   = durationSecs * sampleRate;
  const dataSize     = numSamples * numChannels * (bitsPerSample / 8);
  const headerSize   = 44;
  const fileSize     = headerSize + dataSize;

  const buf = Buffer.alloc(fileSize, 0);
  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(fileSize - 8, 4);
  buf.write('WAVE', 8);
  // fmt chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);               // chunk size
  buf.writeUInt16LE(1, 20);                // PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // byte rate
  buf.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);              // block align
  buf.writeUInt16LE(bitsPerSample, 34);
  // data chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  // PCM data is already zeroed

  return buf;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: DATABASE_URL });

try {
  // Get tenant — prefer ipoteka-bank, fall back to first available
  const { rows: preferred } = await pool.query(
    `SELECT id FROM tenants WHERE id = 'ipoteka-bank' LIMIT 1`
  );
  const { rows: fallback } = preferred.length === 0
    ? await pool.query(`SELECT id FROM tenants LIMIT 1`)
    : { rows: [] };
  const tenantId = preferred[0]?.id ?? fallback[0]?.id ?? 'ipoteka-bank';
  console.log(`Using tenant: ${tenantId}`);

  // Create qa-audio dir and sample WAV files
  const audioDir = join(ROOT, 'qa-audio');
  await mkdir(audioDir, { recursive: true });

  for (const call of SAMPLE_CALLS) {
    const wavBuf = makeSilentWav(Math.min(call.duration_seconds, 5));
    await writeFile(join(audioDir, call.filename), wavBuf);
  }
  console.log(`✓ Created 5 sample WAV files in qa-audio/`);

  // Insert call records
  let created = 0;
  for (const c of SAMPLE_CALLS) {
    // Check if this filename already exists
    const existing = await pool.query(
      `SELECT id FROM calls WHERE tenant_id = $1 AND filename = $2`,
      [tenantId, c.filename],
    );
    if (existing.rows.length > 0) {
      console.log(`  — skipped (already exists): ${c.filename}`);
      continue;
    }

    // Insert lead if this is a lead call
    let leadId = null;
    if (c.is_lead && c.lead_score >= 60) {
      const { rows: leadRows } = await pool.query(
        `INSERT INTO leads (tenant_id, lead_type, lang, product_interest, interest_type, message,
                            confidence, lead_score)
         VALUES ($1, 'product_interest', 'ru', $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          tenantId, c.lead_interest, c.category,
          `[Из звонка] ${c.summary.slice(0, 200)}`,
          c.lead_score / 100, c.lead_score,
        ],
      );
      leadId = leadRows[0]?.id ?? null;
    }

    await pool.query(
      `INSERT INTO calls (
         tenant_id, filename, file_path, duration_seconds, language,
         transcript, summary, sentiment, sentiment_score,
         category, subcategory, priority, topics,
         is_lead, lead_score, lead_interest, lead_id,
         is_complaint, complaint_notes,
         status, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$7,$8,$9,
         $10,$11,$12,$13::jsonb,
         $14,$15,$16,$17,
         $18,$19,
         'completed', now() - (random()*10 || ' days')::interval, now()
       )`,
      [
        tenantId, c.filename, null, c.duration_seconds, c.language,
        c.transcript, c.summary, c.sentiment, c.sentiment_score,
        c.category, c.subcategory, c.priority, JSON.stringify(c.topics),
        c.is_lead, c.lead_score, c.lead_interest || null, leadId,
        c.is_complaint, c.complaint_notes || null,
      ],
    );
    created++;
    console.log(`  ✓ ${c.filename} — ${c.category} | ${c.sentiment} | lead=${c.is_lead} | complaint=${c.is_complaint}`);
  }

  console.log(`\n✅ Created ${created} call records in database.`);

  // Print summary
  const { rows: stats } = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_lead=TRUE) AS leads,
       COUNT(*) FILTER (WHERE is_complaint=TRUE) AS complaints,
       COUNT(*) FILTER (WHERE sentiment='positive') AS positive,
       COUNT(*) FILTER (WHERE sentiment='negative') AS negative
     FROM calls WHERE tenant_id = $1`,
    [tenantId],
  );
  const s = stats[0];
  console.log(`\n📊 Database totals for tenant ${tenantId}:`);
  console.log(`   Total calls:     ${s.total}`);
  console.log(`   Leads detected:  ${s.leads}`);
  console.log(`   Complaints:      ${s.complaints}`);
  console.log(`   Positive:        ${s.positive}`);
  console.log(`   Negative:        ${s.negative}`);

} finally {
  await pool.end();
}
