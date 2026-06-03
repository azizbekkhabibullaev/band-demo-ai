/**
 * Seed script: rich demo data for executive presentation screenshots
 * Inserts sessions, messages, leads, complaints, analytics_events
 */
// Load env manually (avoid dotenv dependency)
import { readFileSync } from 'fs';
try {
  const env = readFileSync(new URL('../apps/backend/.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const [k, ...rest] = line.split('=');
    if (k && rest.length) process.env[k.trim()] = rest.join('=').trim();
  }
} catch {}

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TENANT = 'ipoteka-bank';

async function q(sql, params = []) {
  return pool.query(sql, params);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function ulid() {
  const t = Date.now().toString(36).toUpperCase().padStart(10,'0');
  const r = Math.random().toString(36).substring(2, 12).toUpperCase();
  return (t + r).substring(0, 26);
}

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000);
}

// ── 1. Sessions + messages ────────────────────────────────────────────────────

const SESSIONS = [
  { id: ulid(), lang: 'ru', topic: 'depozit',         turns: 4, hoursAgo: 2 },
  { id: ulid(), lang: 'uz', topic: 'kredit_ariza',     turns: 6, hoursAgo: 5 },
  { id: ulid(), lang: 'ru', topic: 'karta_chiqarish',  turns: 3, hoursAgo: 8 },
  { id: ulid(), lang: 'ru', topic: 'mobile_bank',      turns: 5, hoursAgo: 12 },
  { id: ulid(), lang: 'uz', topic: 'depozit',          turns: 4, hoursAgo: 24 },
  { id: ulid(), lang: 'ru', topic: 'kredit_ariza',     turns: 7, hoursAgo: 30 },
  { id: ulid(), lang: 'ru', topic: 'filial',           turns: 2, hoursAgo: 36 },
  { id: ulid(), lang: 'uz', topic: 'karta_chiqarish',  turns: 3, hoursAgo: 48 },
  { id: ulid(), lang: 'ru', topic: 'depozit',          turns: 5, hoursAgo: 52 },
  { id: ulid(), lang: 'ru', topic: 'o_tkazma',         turns: 4, hoursAgo: 60 },
  { id: ulid(), lang: 'uz', topic: 'kredit_ariza',     turns: 6, hoursAgo: 72 },
  { id: ulid(), lang: 'ru', topic: 'depozit',          turns: 3, hoursAgo: 80 },
  { id: ulid(), lang: 'ru', topic: 'mobile_bank',      turns: 4, hoursAgo: 90 },
  { id: ulid(), lang: 'uz', topic: 'depozit',          turns: 5, hoursAgo: 100 },
  { id: ulid(), lang: 'ru', topic: 'kredit_ariza',     turns: 4, hoursAgo: 110 },
];

const MSG_TEMPLATES = {
  depozit: [
    ['user', 'Подбери мне лучший вклад на 6 месяцев под хорошую ставку'],
    ['assistant', '💰 **Вклады Ipoteka Bank — ваш выбор**\n\nДля 6-месячного вклада рекомендую:\n\n🏆 **«Накопительный» — 18% годовых**\n• Минимальная сумма: 1 000 000 сум\n• Срок: 6 месяцев\n• Выплата процентов: ежемесячно\n\n✅ Также доступен:\n• **«Премиум» — 17.5%** (от 10 млн сум, с пополнением)\n\nПроцентная ставка фиксирована на весь срок. Хотите узнать подробности или оформить заявку?'],
    ['user', 'А можно снять деньги досрочно?'],
    ['assistant', '📋 **Досрочное расторжение вклада**\n\nДа, досрочное снятие возможно:\n• Расторжение без потери процентов — **после 3 месяцев**\n• При расторжении до 3 месяцев — пересчёт по ставке 5% годовых\n\nРекомендуется: если планируете снять раньше 3 месяцев — лучше выбрать **вклад «До востребования»** (14.5%).\n\nОформить заявку? 📞 Горячая линия: 1200'],
  ],
  kredit_ariza: [
    ['user', 'Хочу взять ипотеку на квартиру, какие условия?'],
    ['assistant', '🏠 **Ипотечное кредитование Ipoteka Bank**\n\n✅ **Ключевые условия:**\n• Сумма: до 600 000 000 сум\n• Срок: до 20 лет\n• Ставка: от 22% годовых\n• Первоначальный взнос: от 20%\n\n📋 **Необходимые документы:**\n• Паспорт + ИНН\n• Справка о доходах\n• Оценка недвижимости\n\nОдобрение заявки — в течение 3 рабочих дней.\n\nОставить заявку на консультацию?'],
    ['user', 'Какой нужен первоначальный взнос минимально?'],
    ['assistant', '💵 **Первоначальный взнос по ипотеке**\n\nМинимальный взнос зависит от программы:\n• **Стандартная ипотека** — 20% от стоимости жилья\n• **Льготная программа (молодые семьи)** — 15%\n• **Коммерческая недвижимость** — 30%\n\nПример: квартира за 200 млн сум → взнос от 40 млн сум.\n\n📞 Точные условия по вашей ситуации — специалист рассчитает за 5 минут. Оставить контакт?'],
    ['user', 'Да, перезвоните пожалуйста'],
    ['assistant', '✅ Отлично! Укажите, пожалуйста, ваш номер телефона — специалист свяжется с вами в ближайшее время и ответит на все вопросы по ипотеке.'],
  ],
  karta_chiqarish: [
    ['user', 'Моя карта заблокирована, что делать?'],
    ['assistant', '⚠️ **Карта заблокирована — действуйте сейчас**\n\nЕсть несколько причин блокировки. Решение зависит от типа:\n\n🔴 **Если заблокировали вы сами:**\n→ Откройте мобильное приложение → Карты → Разблокировать\n\n🔴 **Если заблокировал банк (подозрительная операция):**\n→ Позвоните на горячую линию: **📞 1200** (круглосуточно)\n\n🔴 **Если 3 раза неверно введён PIN:**\n→ Обратитесь в любое отделение Ipoteka Bank с паспортом\n\nЧто именно произошло с вашей картой?'],
    ['user', 'Как узнать причину блокировки'],
    ['assistant', '🔍 **Узнать причину блокировки карты**\n\nСамые быстрые способы:\n\n1. **Мобильное приложение** → Карты → нажмите на карту → «История операций» — там будет уведомление о причине\n\n2. **Горячая линия 1200** — оператор сообщит причину мгновенно (паспорт не нужен, только кодовое слово)\n\n3. **SMS** — банк автоматически отправляет SMS с причиной блокировки на ваш номер\n\nРекомендую: позвоните на **1200** — это займёт 2 минуты.'],
  ],
  mobile_bank: [
    ['user', 'Приложение не работает, не могу войти'],
    ['assistant', '📱 **Проблема со входом в приложение**\n\nПопробуйте по шагам:\n\n1️⃣ Проверьте интернет-соединение\n2️⃣ Закройте приложение полностью и откройте снова\n3️⃣ Если не помогло — удалите и переустановите из App Store / Google Play\n\n⚠️ **Если проблема сохраняется:**\n→ Возможно, проводятся технические работы. Позвоните на **1200**.\n\nКакая ошибка отображается при входе?'],
    ['user', 'Написано "неверный пароль" хотя я уверен что правильный'],
    ['assistant', '🔐 **Сброс пароля от мобильного приложения**\n\nЭто распространённая ситуация. Восстановить доступ:\n\n1. На экране входа нажмите **«Забыли пароль?»**\n2. Введите номер телефона, привязанный к аккаунту\n3. Получите SMS-код\n4. Создайте новый пароль\n\n⏱️ Займёт 2 минуты.\n\nЕсли SMS не приходит → горячая линия **1200** (круглосуточно).'],
  ],
  filial: [
    ['user', 'Где ближайшее отделение банка в Ташкенте?'],
    ['assistant', '🏢 **Отделения Ipoteka Bank в Ташкенте**\n\nБлижайшие отделения с полным спектром услуг:\n\n📍 **ул. Амира Темура, 107Б** — Пн-Пт 9:00-18:00, Сб 9:00-14:00\n📍 **пр. Мустакиллик, 54** — Пн-Пт 9:00-17:30\n📍 **ул. Навои, 32** — Пн-Пт 9:00-18:00\n\n🗺️ Все отделения: **ipotekabank.uz/filiallar**\n\nТакже доступны банкоматы 24/7. Удобнее всего — запись онлайн, чтобы избежать очереди.'],
  ],
  o_tkazma: [
    ['user', 'Как сделать перевод на карту другого банка?'],
    ['assistant', '↔️ **Межбанковский перевод**\n\nЧерез мобильное приложение Ipoteka Bank:\n\n1. Откройте вкладку **«Переводы»**\n2. Выберите **«На карту другого банка»**\n3. Введите номер карты получателя (16 цифр)\n4. Укажите сумму\n5. Подтвердите SMS-кодом\n\n💰 **Комиссия:** 1% от суммы (мин. 2 000 сум)\n⏱️ **Время:** мгновенно (Uzcard) или до 1 рабочего дня (Visa/MC)\n\nЕсть вопросы по конкретному переводу?'],
  ],
};

async function seedSessions() {
  console.log('Seeding sessions and messages...');

  // First ensure tenant exists
  await q(`
    INSERT INTO tenants (id, name, allowed_origins, config)
    VALUES ($1, $2, ARRAY['http://localhost:5173','*'], '{}')
    ON CONFLICT (id) DO NOTHING
  `, [TENANT, 'Ipoteka Bank']);

  for (const s of SESSIONS) {
    // Check if session exists
    const exists = await q('SELECT id FROM sessions WHERE id=$1', [s.id]);
    if (exists.rows.length > 0) continue;

    const createdAt = hoursAgo(s.hoursAgo);
    await q(`
      INSERT INTO sessions (id, tenant_id, lang, started_at, last_active_at, ip_hash)
      VALUES ($1, $2, $3, $4, $4, 'demo')
    `, [s.id, TENANT, s.lang, createdAt]);

    // Insert topic analytics event
    await q(`
      INSERT INTO analytics_events (tenant_id, session_id, event_type, payload, created_at)
      VALUES ($1, $2, 'intent_detected', $3, $4)
    `, [TENANT, s.id, JSON.stringify({ topic: s.topic, confidence: 0.85 }), createdAt]);

    // Insert messages
    const template = MSG_TEMPLATES[s.topic] ?? MSG_TEMPLATES['depozit'];
    for (let i = 0; i < Math.min(template.length, s.turns * 2); i++) {
      const [role, content] = template[i];
      const msgAt = new Date(createdAt.getTime() + i * 60000);
      await q(`
        INSERT INTO messages (id, session_id, role, content, created_at, latency_ms, confidence)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        ulid(), s.id, role, content, msgAt,
        role === 'assistant' ? Math.floor(Math.random() * 2000) + 500 : null,
        role === 'assistant' ? (0.7 + Math.random() * 0.28).toFixed(4) : null,
      ]);
    }
  }
  console.log('✓ Sessions and messages seeded');
}

// ── 2. Leads ──────────────────────────────────────────────────────────────────

const LEADS = [
  {
    fullName: 'Баходир Исмоилов', phone: '+998901234567',
    interestType: 'Ипотека', lang: 'ru', status: 'new',
    leadScore: 95, message: 'Хочу взять ипотеку на квартиру, перезвоните пожалуйста',
    hoursAgo: 1,
  },
  {
    fullName: 'Malika Yusupova', phone: '+998911234567',
    interestType: 'Депозит/Вклад', lang: 'uz', status: 'contacted',
    leadScore: 85, message: 'Eng yuqori foizli depozit haqida ma\'lumot kerak',
    hoursAgo: 3,
  },
  {
    fullName: 'Фаррух Ташкентов', phone: '+998901112233',
    interestType: 'Кредит', lang: 'ru', status: 'qualified',
    leadScore: 92, message: 'Нужен потребительский кредит на 20 миллионов, срочно',
    hoursAgo: 6,
  },
  {
    fullName: null, phone: '+998907654321',
    interestType: 'Ипотека', lang: 'ru', status: 'new',
    leadScore: 45, message: 'Ипотека',
    hoursAgo: 8,
  },
  {
    fullName: 'Дилноза Каримова', phone: '+998935551234',
    interestType: 'Депозит/Вклад', lang: 'ru', status: 'converted',
    leadScore: 88, message: 'Хочу открыть вклад на 50 миллионов на 12 месяцев',
    hoursAgo: 24,
  },
  {
    fullName: 'Sherzod Raxmatullayev', phone: '+998909876543',
    interestType: 'Автокредит', lang: 'uz', status: 'contacted',
    leadScore: 78, message: 'Avtokredit olmoqchiman, Cobalt uchun',
    hoursAgo: 30,
  },
  {
    fullName: 'Сардор Нишанов', phone: '+998901234890',
    interestType: 'Кредит', lang: 'ru', status: 'new',
    leadScore: 55, message: 'Кредит',
    hoursAgo: 48,
  },
  {
    fullName: 'Zulfiya Toshmatova', phone: '+998917890123',
    interestType: 'Депозит/Вклад', lang: 'uz', status: 'closed',
    leadScore: 72, message: 'Depozit shartlari haqida so\'ramoqchiman',
    hoursAgo: 72,
  },
];

async function seedLeads() {
  console.log('Seeding leads...');

  // Delete existing demo leads to avoid duplicates
  await q(`DELETE FROM leads WHERE tenant_id=$1 AND message ILIKE '%demo%' OR (tenant_id=$1 AND lead_score > 40 AND created_at > NOW() - INTERVAL '10 days')`, [TENANT]).catch(() => {});

  for (const lead of LEADS) {
    const id = ulid();
    const createdAt = hoursAgo(lead.hoursAgo);

    // Find matching session
    const sessionRow = await q(
      `SELECT id FROM sessions WHERE tenant_id=$1 ORDER BY started_at DESC LIMIT 1 OFFSET $2`,
      [TENANT, Math.floor(Math.random() * 5)]
    );
    const sessionId = sessionRow.rows[0]?.id ?? null;

    await q(`
      INSERT INTO leads (id, tenant_id, session_id, full_name, phone, interest_type,
        product_interest, lang, status, lead_score, message, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11)
      ON CONFLICT DO NOTHING
    `, [
      id, TENANT, sessionId, lead.fullName, lead.phone, lead.interestType,
      lead.lang, lead.status, lead.leadScore, lead.message, createdAt,
    ]);

    // Insert timeline entry
    await q(`
      INSERT INTO lead_status_history (id, lead_id, from_status, to_status, created_at)
      VALUES ($1,$2,NULL,$3,$4)
      ON CONFLICT DO NOTHING
    `, [ulid(), id, lead.status === 'new' ? 'new' : 'new', createdAt]);

    if (lead.status !== 'new') {
      await q(`
        INSERT INTO lead_status_history (id, lead_id, from_status, to_status, created_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT DO NOTHING
      `, [ulid(), id, 'new', lead.status, new Date(createdAt.getTime() + 3600000)]);
    }
  }
  console.log('✓ Leads seeded');
}

// ── 3. Analytics events (complaint signals) ───────────────────────────────────

const COMPLAINT_EVENTS = [
  { category: 'mobile_app', count: 7, msg: 'Приложение не работает / ilova ishlamayapti' },
  { category: 'card',       count: 5, msg: 'Карта заблокирована без причины' },
  { category: 'transfer',   count: 3, msg: 'Деньги не дошли / pul kelmadi' },
  { category: 'otp',        count: 4, msg: 'SMS код не приходит' },
  { category: 'loan',       count: 2, msg: 'Отказали в кредите без объяснений' },
  { category: 'branch',     count: 3, msg: 'Большая очередь в отделении' },
  { category: 'deposit',    count: 1, msg: 'Проценты начислены неверно' },
  { category: 'service_quality', count: 2, msg: 'Недоволен качеством обслуживания' },
];

async function seedComplaints() {
  console.log('Seeding complaint events...');

  for (const c of COMPLAINT_EVENTS) {
    for (let i = 0; i < c.count; i++) {
      const sessionRow = await q(
        `SELECT id FROM sessions WHERE tenant_id=$1 ORDER BY RANDOM() LIMIT 1`,
        [TENANT]
      );
      const sessionId = sessionRow.rows[0]?.id;
      if (!sessionId) continue;

      await q(`
        INSERT INTO analytics_events (tenant_id, session_id, event_type, payload, created_at)
        VALUES ($1,$2,'complaint_signal',$3,$4)
      `, [
        TENANT, sessionId,
        JSON.stringify({ category: c.category, message: c.msg }),
        hoursAgo(Math.floor(Math.random() * 168)),
      ]);
    }
  }
  console.log('✓ Complaint events seeded');
}

// ── 4. Quick action clicks ─────────────────────────────────────────────────────

const QA_CLICKS = [
  { label: '📈 Текущие ставки', intent: 'depozit', type: 'info', lang: 'ru', n: 23 },
  { label: '💵 Минимальная сумма', intent: 'depozit', type: 'info', lang: 'ru', n: 17 },
  { label: '📞 Консультация', intent: 'kredit_ariza', type: 'lead', lang: 'ru', n: 31 },
  { label: '🏠 Условия ипотеки', intent: 'kredit_ariza', type: 'info', lang: 'ru', n: 14 },
  { label: 'Foiz stavkasi', intent: 'depozit', type: 'info', lang: 'uz', n: 12 },
  { label: '💬 Оставить заявку', intent: 'kredit_ariza', type: 'lead', lang: 'ru', n: 28 },
];

async function seedQuickActions() {
  console.log('Seeding quick action clicks...');

  for (const qa of QA_CLICKS) {
    const sessionRow = await q(
      `SELECT id FROM sessions WHERE tenant_id=$1 ORDER BY RANDOM() LIMIT 1`,
      [TENANT]
    );
    const sessionId = sessionRow.rows[0]?.id;
    if (!sessionId) continue;

    for (let i = 0; i < qa.n; i++) {
      await q(`
        INSERT INTO quick_action_clicks
          (id, tenant_id, session_id, chip_label, chip_type, intent, lang, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        ulid(), TENANT, sessionId, qa.label, qa.type, qa.intent, qa.lang,
        hoursAgo(Math.floor(Math.random() * 168)),
      ]);
    }
  }
  console.log('✓ Quick action clicks seeded');
}

// ── 5. Volume data (extra sessions per day for chart) ─────────────────────────

async function seedVolumeData() {
  console.log('Seeding volume data (daily sessions for chart)...');

  const dailyCounts = [12, 18, 25, 21, 30, 27, 35, 29, 22, 19, 28, 33, 38, 31];

  for (let day = 13; day >= 0; day--) {
    const count = dailyCounts[13 - day] ?? 20;
    const existing = await q(
      `SELECT COUNT(*) FROM sessions WHERE tenant_id=$1 AND started_at::date = (NOW() - INTERVAL '${day} days')::date`,
      [TENANT]
    );
    const need = count - parseInt(existing.rows[0].count);
    if (need <= 0) continue;

    for (let i = 0; i < need; i++) {
      const sid = ulid();
      const t = new Date(Date.now() - day * 86400000 - Math.random() * 50000000);
      const lang = Math.random() < 0.45 ? 'uz' : 'ru';
      await q(
        `INSERT INTO sessions (id, tenant_id, lang, started_at, last_active_at, ip_hash) VALUES ($1,$2,$3,$4,$4,'vol')`,
        [sid, TENANT, lang, t]
      );
    }
  }
  console.log('✓ Volume data seeded');
}

// ── Main ──────────────────────────────────────────────────────────────────────

try {
  await seedSessions();
  await seedLeads();
  await seedComplaints();
  await seedQuickActions();
  await seedVolumeData();

  // Verify
  const [sess, leads, complaints, qa] = await Promise.all([
    q(`SELECT COUNT(*) FROM sessions WHERE tenant_id=$1`, [TENANT]),
    q(`SELECT COUNT(*) FROM leads WHERE tenant_id=$1`, [TENANT]),
    q(`SELECT COUNT(*) FROM analytics_events WHERE tenant_id=$1 AND event_type='complaint_signal'`, [TENANT]),
    q(`SELECT COUNT(*) FROM quick_action_clicks WHERE tenant_id=$1`, [TENANT]),
  ]);

  console.log('\n✅ Demo data summary:');
  console.log(`   Sessions:       ${sess.rows[0].count}`);
  console.log(`   Leads:          ${leads.rows[0].count}`);
  console.log(`   Complaint evts: ${complaints.rows[0].count}`);
  console.log(`   QA clicks:      ${qa.rows[0].count}`);
} finally {
  await pool.end();
}
