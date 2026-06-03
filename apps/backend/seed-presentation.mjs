/**
 * Seed rich demo data for executive presentation screenshots
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';

// Load env
try {
  const env = readFileSync(new URL('.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k) process.env[k] = v;
    }
  }
} catch {}

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TENANT = 'ipoteka-bank';
async function q(sql, p = []) { return pool.query(sql, p); }

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function hoursAgo(h) { return new Date(Date.now() - h * 3600000); }

// ── 1. Ensure tenant ──────────────────────────────────────────────────────────
await q(`
  INSERT INTO tenants (id, name, allowed_origins, config)
  VALUES ($1,$2,ARRAY['http://localhost:5173','*'],'{"branding":{"displayName":"Ipoteka Bank","accentColor":"#1e40af"},"languages":{"default":"ru","enabled":["uz","ru"]},"hotline":"1200","greeting":{"ru":"Здравствуйте! Добро пожаловать в Ипотека Банк. Чем могу помочь?","uz":"Salom! Ipoteka Bank xizmatiga xush kelibsiz. Qanday yordam bera olaman?"}}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, config=EXCLUDED.config
`, [TENANT, 'Ipoteka Bank']);
console.log('✓ tenant ready');

// ── 2. Sessions + messages ────────────────────────────────────────────────────
const FLOWS = {
  depozit: [
    ['user','Подбери мне лучший вклад на 6 месяцев'],
    ['assistant','💰 **Топ вклады Ipoteka Bank**\n\n🏆 **«Накопительный»** — 18% годовых\n• Срок: 6 мес · От 1 000 000 сум\n• Выплата процентов: ежемесячно\n\n✅ **«Премиум»** — 17.5% (от 10 млн, с пополнением)\n\nХотите открыть или узнать подробнее?'],
    ['user','А можно пополнять вклад?'],
    ['assistant','✅ Вклад «Премиум» поддерживает пополнение в любое время.\n\nМин. пополнение — 100 000 сум. Для открытия: **📞 1200** или любое отделение.'],
  ],
  kredit: [
    ['user','Хочу взять ипотеку, перезвоните мне пожалуйста'],
    ['assistant','🏠 **Ипотека Ipoteka Bank**\n\n✅ До 600 млн сум · До 20 лет · От 22% годовых\n📋 Первый взнос: от 20%\n\nОставьте контакт — специалист свяжется и рассчитает условия.'],
    ['user','Какой минимальный взнос?'],
    ['assistant','💵 **Первоначальный взнос:**\n• Стандарт — 20%\n• Молодые семьи — 15%\n\nПример: квартира 200 млн → взнос от 40 млн.\n\nТочный расчёт — позвоните **1200**.'],
    ['user','Да, я оставлю заявку'],
    ['assistant','Отлично! Укажите номер телефона в форме ниже — специалист перезвонит в рабочее время.'],
  ],
  karta: [
    ['user','Моя карта заблокирована что делать'],
    ['assistant','⚠️ **Карта заблокирована:**\n\n1️⃣ Приложение → Карты → Разблокировать\n2️⃣ Горячая линия: **📞 1200** (24/7)\n3️⃣ Отделение с паспортом (если неверный PIN 3 раза)\n\nЧто произошло?'],
    ['user','Неверный пин три раза'],
    ['assistant','🔐 При 3 неверных PIN карта блокируется автоматически.\n\n**Разблокировка:** любое отделение с паспортом, 10 минут.\n\nАдреса: **1200** или ipotekabank.uz'],
  ],
  mobile: [
    ['user','Не могу войти в приложение ошибка'],
    ['assistant','📱 **Проблема со входом:**\n\n1️⃣ Перезапустите приложение\n2️⃣ Проверьте интернет\n3️⃣ Переустановите из App Store / Google Play\n\nКакая ошибка на экране?'],
    ['user','Сервер недоступен написано'],
    ['assistant','Временная ошибка подключения. Попробуйте через 5-10 минут.\n\nПроблема не решилась → **📞 1200** (тех. поддержка).'],
  ],
  filial: [
    ['user','Где ближайшее отделение в Ташкенте'],
    ['assistant','🏢 **Отделения Ipoteka Bank в Ташкенте:**\n\n📍 ул. Амира Темура, 107Б — Пн-Пт 9:00-18:00\n📍 пр. Мустакиллик, 54 — Пн-Пт 9:00-17:30\n📍 ул. Навои, 32 — Пн-Сб 9:00-18:00\n\nВсе отделения: ipotekabank.uz/filiallar'],
  ],
};

const sessionCfgs = [
  {topic:'depozit',lang:'ru',h:2},{topic:'kredit',lang:'ru',h:5},
  {topic:'karta',lang:'ru',h:8},{topic:'mobile',lang:'ru',h:12},
  {topic:'depozit',lang:'uz',h:18},{topic:'kredit',lang:'uz',h:26},
  {topic:'filial',lang:'ru',h:34},{topic:'karta',lang:'uz',h:42},
  {topic:'depozit',lang:'ru',h:50},{topic:'kredit',lang:'ru',h:58},
  {topic:'mobile',lang:'uz',h:70},{topic:'depozit',lang:'ru',h:90},
];

const sessionIds = [];
for (const cfg of sessionCfgs) {
  const sid = uuid();
  sessionIds.push(sid);
  const t = hoursAgo(cfg.h);
  await q(`INSERT INTO sessions(id,tenant_id,lang,created_at,last_active_at,ip_hash) VALUES($1,$2,$3,$4,$4,'demo') ON CONFLICT DO NOTHING`, [sid,TENANT,cfg.lang,t]);
  const msgs = FLOWS[cfg.topic] ?? FLOWS.depozit;
  for (let i=0;i<msgs.length;i++) {
    const [role,content] = msgs[i];
    await q(`INSERT INTO messages(id,session_id,tenant_id,role,content,lang,created_at,latency_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [uuid(),sid,TENANT,role,content,cfg.lang,new Date(t.getTime()+i*90000),
       role==='assistant'?(400+Math.random()*1800|0):null]);
    if(role==='user'&&i===0) await q(`INSERT INTO analytics_events(tenant_id,session_id,event_type,intent_name,confidence,properties,created_at) VALUES($1,$2,'intent_detected',$3,$4,'{}',$5)`,
      [TENANT,sid,cfg.topic,+(0.7+Math.random()*0.28).toFixed(4),t]);
  }
}
console.log(`✓ ${sessionCfgs.length} sessions seeded`);

// ── 3. Leads ──────────────────────────────────────────────────────────────────
await q(`DELETE FROM leads WHERE tenant_id=$1 AND created_at > NOW() - INTERVAL '5 days'`,[TENANT]).catch(()=>{});

const leadsData = [
  {n:'Баходир Исмоилов',    ph:'+998901234567',i:'Ипотека',       l:'ru',st:'new',      sc:95,lt:'callback',       m:'Хочу взять ипотеку, перезвоните',h:1},
  {n:'Malika Yusupova',     ph:'+998911234567',i:'Депозит/Вклад', l:'uz',st:'contacted',sc:85,lt:'consultation',     m:"Eng yuqori foizli depozit kerak",h:4},
  {n:'Фаррух Ташкентов',   ph:'+998901112233',i:'Кредит',        l:'ru',st:'qualified', sc:92,lt:'product_interest',m:'Нужен кредит 20 миллионов срочно',h:7},
  {n:null,                  ph:'+998907654321',i:'Ипотека',       l:'ru',st:'new',      sc:45,lt:'callback',       m:'Ипотека интересует',h:9},
  {n:'Дилноза Каримова',   ph:'+998935551234',i:'Депозит/Вклад', l:'ru',st:'converted', sc:88,lt:'product_interest',m:'Хочу открыть вклад 50 миллионов',h:26},
  {n:'Sherzod Raxmatullayev',ph:'+998909876543',i:'Автокредит',   l:'uz',st:'contacted',sc:78,lt:'consultation',     m:'Avtokredit — Cobalt uchun',h:32},
  {n:'Сардор Нишанов',     ph:'+998901234890',i:'Кредит',        l:'ru',st:'new',      sc:55,lt:'callback',       m:'Кредит нужен',h:50},
  {n:'Zulfiya Toshmatova',  ph:'+998917890123',i:'Депозит/Вклад', l:'uz',st:'closed',   sc:72,lt:'product_interest',m:'Depozit shartlari haqida',h:74},
];

for(let i=0;i<leadsData.length;i++){
  const l=leadsData[i]; const lid=uuid(); const t=hoursAgo(l.h); const sid=sessionIds[i%sessionIds.length];
  await q(`INSERT INTO leads(id,tenant_id,session_id,full_name,phone,interest_type,product_interest,lang,status,lead_score,message,lead_type,created_at) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
    [lid,TENANT,sid,l.n,l.ph,l.i,l.l,l.st,l.sc,l.m,l.lt,t]);
  await q(`INSERT INTO lead_status_history(lead_id,tenant_id,from_status,to_status,created_at) VALUES($1,$2,NULL,'new',$3)`,[lid,TENANT,t]);
  if(l.st!=='new'){
    await q(`INSERT INTO lead_status_history(lead_id,tenant_id,from_status,to_status,created_at) VALUES($1,$2,'new',$3,$4)`,
      [lid,TENANT,l.st,new Date(t.getTime()+7200000)]);
  }
}
console.log(`✓ ${leadsData.length} leads seeded`);

// ── 4. Complaint signals ──────────────────────────────────────────────────────
const cmpls=[
  {c:'mobile_app',n:8,m:'Приложение не работает'},
  {c:'card',n:6,m:'Карта заблокирована'},{c:'transfer',n:4,m:'Деньги не дошли'},
  {c:'otp',n:5,m:'SMS не приходит'},{c:'loan',n:3,m:'Отказали в кредите'},
  {c:'branch',n:4,m:'Большая очередь'},{c:'deposit',n:2,m:'Проценты неверные'},
  {c:'service_quality',n:3,m:'Плохой сервис'},
];
for(const c of cmpls){
  for(let i=0;i<c.n;i++){
    await q(`INSERT INTO analytics_events(tenant_id,session_id,event_type,properties,created_at) VALUES($1,$2,'complaint_signal',$3,$4)`,
      [TENANT,sessionIds[i%sessionIds.length],JSON.stringify({category:c.c,message:c.m}),hoursAgo(Math.random()*100|0)]);
  }
}
console.log('✓ complaint signals seeded');

// ── 5. Quick action clicks ─────────────────────────────────────────────────────
const chips=[
  {label:'📈 Текущие ставки',intent:'depozit',type:'info',lang:'ru',n:24},
  {label:'💬 Оставить заявку',intent:'kredit_ariza',type:'lead',lang:'ru',n:31},
  {label:'💵 Мин. сумма вклада',intent:'depozit',type:'info',lang:'ru',n:18},
  {label:'📞 Консультация',intent:'kredit_ariza',type:'lead',lang:'ru',n:27},
  {label:'Foiz stavkasi',intent:'depozit',type:'info',lang:'uz',n:13},
  {label:'🏠 Условия ипотеки',intent:'kredit_ariza',type:'info',lang:'ru',n:16},
];
for(const chip of chips){
  for(let i=0;i<chip.n;i++){
    await q(`INSERT INTO quick_action_clicks(tenant_id,session_id,chip_label,chip_type,intent,lang,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [TENANT,sessionIds[i%sessionIds.length],chip.label,chip.type,chip.intent,chip.lang,hoursAgo(Math.random()*168|0)]);
  }
}
console.log('✓ quick action clicks seeded');

// ── 6. Volume data ─────────────────────────────────────────────────────────────
const daily=[8,12,15,11,18,22,19,25,21,17,24,28,32,26];
for(let day=13;day>=0;day--){
  const n=daily[13-day]??15;
  for(let i=0;i<n;i++){
    const t=new Date(Date.now()-day*86400000-Math.random()*40000000);
    const sid=uuid();
    await q(`INSERT INTO sessions(id,tenant_id,lang,created_at,last_active_at,ip_hash) VALUES($1,$2,$3,$4,$4,'vol') ON CONFLICT DO NOTHING`,
      [sid,TENANT,Math.random()<0.45?'uz':'ru',t]);
    await q(`INSERT INTO messages(id,session_id,tenant_id,role,content,lang,created_at,latency_ms) VALUES($1,$2,$3,'assistant','Ответ AI','ru',$4,$5) ON CONFLICT DO NOTHING`,
      [uuid(),sid,TENANT,new Date(t.getTime()+1500),350+(Math.random()*800|0)]);
  }
}
console.log('✓ volume data seeded');

const [sess,leads,compl,qa]=await Promise.all([
  q(`SELECT COUNT(*) FROM sessions WHERE tenant_id=$1`,[TENANT]),
  q(`SELECT COUNT(*) FROM leads WHERE tenant_id=$1`,[TENANT]),
  q(`SELECT COUNT(*) FROM analytics_events WHERE tenant_id=$1 AND event_type='complaint_signal'`,[TENANT]),
  q(`SELECT COUNT(*) FROM quick_action_clicks WHERE tenant_id=$1`,[TENANT]),
]);
console.log('\n✅ Final counts:');
console.log(`   Sessions:   ${sess.rows[0].count}`);
console.log(`   Leads:      ${leads.rows[0].count}`);
console.log(`   Complaints: ${compl.rows[0].count}`);
console.log(`   QA clicks:  ${qa.rows[0].count}`);
await pool.end();
