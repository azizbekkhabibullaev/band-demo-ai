/**
 * Automated screenshot capture for executive presentation
 * Uses puppeteer-core with local Chrome installation
 */
import puppeteer from 'puppeteer-core';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
const SS_DIR = '/Users/azizbekkhabibullaev/Downloads/bank-chatbot-master/presentation/assets/screenshots';
const ADMIN_PASS = 'IpotekaAdmin2026';

async function ensureDirs() {
  await mkdir(`${SS_DIR}/client`, { recursive: true });
  await mkdir(`${SS_DIR}/admin`, { recursive: true });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ss(page, filename, clip = null) {
  const opts = { path: filename, type: 'png' };
  if (clip) opts.clip = clip;
  await page.screenshot(opts);
  console.log(`  ✓ ${filename.split('/').pop()}`);
}

async function adminLogin(page) {
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle0' });
  await sleep(500);
  
  // Fill login form
  const inputs = await page.$$('input');
  if (inputs.length >= 2) {
    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type('admin');
    await inputs[1].click({ clickCount: 3 });
    await inputs[1].type(ADMIN_PASS);
  }
  
  // Take login screenshot BEFORE submitting
  await ss(page, `${SS_DIR}/admin/10_admin_login.png`);
  
  // Submit
  const submitBtn = await page.$('button[type="submit"]') ?? await page.$('button');
  if (submitBtn) await submitBtn.click();
  await sleep(2000);
  
  // Verify we're logged in
  const url = page.url();
  console.log(`  Logged in, at: ${url}`);
}

async function main() {
  await ensureDirs();
  
  console.log('Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // ── CLIENT SCREENSHOTS ─────────────────────────────────────────────────────

  console.log('\n📸 CLIENT: Widget closed (FAB visible)');
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await sleep(1500);
  await ss(page, `${SS_DIR}/client/01_widget_closed.png`);

  console.log('📸 CLIENT: Widget opening (typewriter animation)');
  // Click FAB
  const fab = await page.$('button[class*="fixed"]') ?? await page.$$('button').then(btns => btns[btns.length-1]);
  if (fab) {
    await fab.click();
    await sleep(800); // capture during typewriter
    await ss(page, `${SS_DIR}/client/02_widget_typewriter.png`);
  }

  console.log('📸 CLIENT: Widget greeting (after typewriter)');
  await sleep(3500);
  await ss(page, `${SS_DIR}/client/03_widget_greeting.png`);

  console.log('📸 CLIENT: AI response to deposit question');
  // Find chat input
  const chatInput = await page.$('textarea') ?? await page.$('input[placeholder*=""]');
  if (chatInput) {
    await chatInput.click();
    await chatInput.type('Подбери мне лучший вклад на 6 месяцев');
    await page.keyboard.press('Enter');
    await sleep(6000); // wait for AI response
    await ss(page, `${SS_DIR}/client/04_ai_deposit_response.png`);
  }

  console.log('📸 CLIENT: Quick action chips');
  // Scroll to bottom to see chips
  await page.evaluate(() => {
    const lists = document.querySelectorAll('[class*="overflow"]');
    lists.forEach(el => el.scrollTo(0, el.scrollHeight));
  });
  await sleep(500);
  await ss(page, `${SS_DIR}/client/05_quick_action_chips.png`);

  console.log('📸 CLIENT: UZ language switch');
  // Find language switcher
  const langBtns = await page.$$('button');
  for (const btn of langBtns) {
    const text = await btn.evaluate(el => el.textContent);
    if (text && (text.includes('🇺🇿') || text.includes('UZ') || text.includes('uz'))) {
      await btn.click();
      await sleep(1500);
      break;
    }
  }
  await ss(page, `${SS_DIR}/client/08_widget_uzbek.png`);

  // Switch back to RU
  for (const btn of langBtns) {
    const text = await btn.evaluate(el => el.textContent);
    if (text && (text.includes('🇷🇺') || text.includes('RU') || text.includes('ru'))) {
      await btn.click();
      await sleep(500);
      break;
    }
  }

  console.log('📸 CLIENT: Card blocked response');
  // Navigate fresh and ask about blocked card
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await sleep(1500);
  // Open widget
  const fabBtn = await page.$('button[class*="fixed"]') ?? await page.$$('button').then(btns => btns[btns.length-1]);
  if (fabBtn) {
    await fabBtn.click();
    await sleep(3000); // wait for greeting
    const inp = await page.$('textarea') ?? await page.$('input[type="text"]');
    if (inp) {
      await inp.click();
      await inp.type('Моя карта заблокирована, что делать?');
      await page.keyboard.press('Enter');
      await sleep(6000);
      await ss(page, `${SS_DIR}/client/09_card_blocked_response.png`);
    }
  }

  console.log('📸 CLIENT: Lead capture form');
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await sleep(1500);
  const fab2 = await page.$('button[class*="fixed"]') ?? await page.$$('button').then(btns => btns[btns.length-1]);
  if (fab2) {
    await fab2.click();
    await sleep(3000);
    const inp2 = await page.$('textarea') ?? await page.$('input[type="text"]');
    if (inp2) {
      await inp2.click();
      await inp2.type('Хочу взять ипотеку, перезвоните мне пожалуйста');
      await page.keyboard.press('Enter');
      await sleep(6000);
      await ss(page, `${SS_DIR}/client/06_lead_capture_form.png`);

      // Fill and submit lead form
      console.log('📸 CLIENT: Lead success');
      const leadInputs = await page.$$('input');
      for (const input of leadInputs) {
        const ph = await input.evaluate(el => el.placeholder);
        if (ph && ph.includes('имя')) {
          await input.click();
          await input.type('Баходир');
        } else if (ph && ph.includes('+998')) {
          await input.click();
          await input.type('+998901234567');
        }
      }
      await sleep(500);
      // Submit
      const submitLead = await page.$('button[type="submit"]');
      if (submitLead) {
        await submitLead.click();
        await sleep(2000);
        await ss(page, `${SS_DIR}/client/07_lead_success.png`);
      }
    }
  }

  // ── ADMIN SCREENSHOTS ──────────────────────────────────────────────────────

  console.log('\n📸 ADMIN: Login page');
  await adminLogin(page);

  console.log('📸 ADMIN: Dashboard');
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle0' });
  await sleep(2500);
  await ss(page, `${SS_DIR}/admin/11_dashboard_full.png`);

  // KPI section close-up
  console.log('📸 ADMIN: KPI cards close-up');
  const kpiEl = await page.$('.grid');
  if (kpiEl) {
    const box = await kpiEl.boundingBox();
    if (box) await ss(page, `${SS_DIR}/admin/12_dashboard_kpi.png`, { x: box.x, y: box.y, width: Math.min(box.width, 1440), height: Math.min(box.height + 20, 300) });
    else await ss(page, `${SS_DIR}/admin/12_dashboard_kpi.png`);
  } else {
    await ss(page, `${SS_DIR}/admin/12_dashboard_kpi.png`);
  }

  console.log('📸 ADMIN: Lead funnel');
  await page.evaluate(() => window.scrollTo(0, 300));
  await sleep(300);
  await ss(page, `${SS_DIR}/admin/13_lead_funnel.png`);

  console.log('📸 ADMIN: Top products');
  await page.evaluate(() => window.scrollTo(0, 600));
  await sleep(300);
  await ss(page, `${SS_DIR}/admin/14_top_products.png`);

  console.log('📸 ADMIN: Conversations list');
  await page.goto(`${BASE}/admin/conversations`, { waitUntil: 'networkidle0' });
  await sleep(2000);
  await ss(page, `${SS_DIR}/admin/15_conversations_list.png`);

  console.log('📸 ADMIN: Conversation detail');
  // Click first conversation
  const convRow = await page.$('button[class*="hover"]') ?? await page.$$('div[class*="cursor"]').then(els => els[0]);
  if (convRow) {
    await convRow.click();
    await sleep(1000);
  }
  await ss(page, `${SS_DIR}/admin/16_conversation_detail.png`);

  console.log('📸 ADMIN: Leads page');
  await page.goto(`${BASE}/admin/leads`, { waitUntil: 'networkidle0' });
  await sleep(2000);
  await ss(page, `${SS_DIR}/admin/17_leads_page.png`);

  console.log('📸 ADMIN: Lead card expanded');
  // Click "История" on first lead
  const histBtn = await page.$x ? await page.$x('//button[contains(text(),"История")]').then(r => r[0]) : null;
  if (!histBtn) {
    const allBtns = await page.$$('button');
    for (const btn of allBtns) {
      const txt = await btn.evaluate(el => el.textContent);
      if (txt && txt.includes('История')) {
        await btn.click();
        await sleep(800);
        break;
      }
    }
  } else {
    await histBtn.click();
    await sleep(800);
  }
  await ss(page, `${SS_DIR}/admin/18_lead_card_expanded.png`);

  console.log('📸 ADMIN: Complaints page');
  await page.goto(`${BASE}/admin/complaints`, { waitUntil: 'networkidle0' });
  await sleep(2000);
  await ss(page, `${SS_DIR}/admin/19_complaints_page.png`);

  console.log('📸 ADMIN: Conversion funnel (leads bottom)');
  await page.goto(`${BASE}/admin/leads`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  await ss(page, `${SS_DIR}/admin/20_conversion_funnel.png`);

  await browser.close();

  // Verify all screenshots exist
  console.log('\n✅ Screenshot verification:');
  const expected = [
    'client/01_widget_closed.png', 'client/02_widget_typewriter.png',
    'client/03_widget_greeting.png', 'client/04_ai_deposit_response.png',
    'client/05_quick_action_chips.png', 'client/06_lead_capture_form.png',
    'client/07_lead_success.png', 'client/08_widget_uzbek.png',
    'client/09_card_blocked_response.png',
    'admin/10_admin_login.png', 'admin/11_dashboard_full.png',
    'admin/12_dashboard_kpi.png', 'admin/13_lead_funnel.png',
    'admin/14_top_products.png', 'admin/15_conversations_list.png',
    'admin/16_conversation_detail.png', 'admin/17_leads_page.png',
    'admin/18_lead_card_expanded.png', 'admin/19_complaints_page.png',
    'admin/20_conversion_funnel.png',
  ];
  let allOk = true;
  for (const f of expected) {
    const exists = existsSync(`${SS_DIR}/${f}`);
    console.log(`  ${exists ? '✅' : '❌'} ${f}`);
    if (!exists) allOk = false;
  }
  console.log(allOk ? '\n🎉 All screenshots captured!' : '\n⚠️  Some screenshots missing');
}

main().catch(e => { console.error(e); process.exit(1); });
