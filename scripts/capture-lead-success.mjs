/**
 * Capture 06_lead_capture_form.png and 07_lead_success.png
 * Uses page.evaluate to check React streaming state and scroll into view
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';
const SS_DIR = '/Users/azizbekkhabibullaev/Downloads/bank-chatbot-master/presentation/assets/screenshots';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1440,900', '--no-sandbox'],
  defaultViewport: { width: 1440, height: 900 }
});

const page = await browser.newPage();

// Intercept console to see React errors
page.on('console', msg => {
  if (msg.type() === 'error') console.log('[console error]', msg.text());
});

await page.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(1500);

// Find and click FAB
const allButtons = await page.$$('button');
for (let i = allButtons.length - 1; i >= 0; i--) {
  const box = await allButtons[i].boundingBox();
  if (box && box.x > 1200 && box.y > 750) {
    await allButtons[i].click();
    console.log(`Clicked FAB at ${Math.round(box.x)},${Math.round(box.y)}`);
    break;
  }
}

// Wait for widget to open and greeting to finish
await sleep(5000);

// Find chat textarea
const inp = await page.$('textarea') ?? await page.$('input[type="text"]');
if (!inp) {
  console.error('No chat input found');
  await browser.close();
  process.exit(1);
}

// Type mortgage message
await inp.click();
await inp.type('Хочу взять ипотеку, перезвоните мне пожалуйста');
await page.keyboard.press('Enter');
console.log('Sent mortgage message...');

// Wait for AI response by polling for input elements (up to 30s)
// Also scroll the widget content to the bottom
let inputs = [];
for (let i = 0; i < 30; i++) {
  await sleep(1000);

  // Scroll all scrollable containers to bottom
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 10) {
        el.scrollTop = el.scrollHeight;
      }
    });
  });

  // Check inputs (scrolled into view)
  inputs = await page.$$('input');

  // Check page state
  const state = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    const bodyText = document.body.innerText;
    // Look for AI response text that has emoji/markdown (indicates real AI response)
    const hasAIResponse = bodyText.includes('🏠') || bodyText.includes('ипотека') ||
                          bodyText.includes('Ипотека') || bodyText.includes('сум') ||
                          bodyText.includes('%') || bodyText.includes('млн');
    return {
      inputCount: inputs.length,
      bodyLength: bodyText.length,
      hasAIResponse,
      snippet: bodyText.substring(bodyText.length - 200)
    };
  });

  console.log(`t=${i+1}s: inputs=${state.inputCount}, hasAI=${state.hasAIResponse}, bodyLen=${state.bodyLength}`);
  if (state.snippet.length > 0 && i < 3) console.log(`  snippet: "${state.snippet}"`);

  if (state.inputCount > 0) {
    console.log('✓ Lead form appeared!');
    break;
  }
}

// Final scroll before screenshot
await page.evaluate(() => {
  document.querySelectorAll('*').forEach(el => {
    if (el.scrollHeight > el.clientHeight + 10) {
      el.scrollTop = el.scrollHeight;
    }
  });
});
await sleep(500);

// Take lead form screenshot
await page.screenshot({ path: `${SS_DIR}/client/06_lead_capture_form.png`, type: 'png' });
console.log('✓ Saved 06_lead_capture_form.png');

if (inputs.length === 0) {
  // Check what the page looks like
  const finalState = await page.evaluate(() => ({
    allText: document.body.innerText,
    allInputs: Array.from(document.querySelectorAll('input')).map(i => ({type:i.type, ph:i.placeholder})),
    allForms: document.querySelectorAll('form').length
  }));
  console.log('Final page text (last 400 chars):', finalState.allText.slice(-400));
  console.log('All inputs in DOM:', finalState.allInputs);
  console.log('All forms:', finalState.allForms);

  // Save as 07 fallback
  await page.screenshot({ path: `${SS_DIR}/client/07_lead_success.png`, type: 'png' });
  console.log('✓ Saved 07_lead_success.png (fallback)');
  await browser.close();
  process.exit(0);
}

// Fill the form
let nameInput = null, phoneInput = null;
for (const input of inputs) {
  const info = await input.evaluate(el => ({ type: el.type, ph: el.placeholder }));
  console.log(`  Input: type="${info.type}" ph="${info.ph}"`);
  if (info.ph.includes('имя') || info.ph.includes('Ismingiz')) nameInput = input;
  else if (info.ph.includes('+998') || info.type === 'tel') phoneInput = input;
}

if (nameInput) {
  await nameInput.click({ clickCount: 3 });
  await nameInput.type('Баходир');
  console.log('Filled name');
}
if (phoneInput) {
  await phoneInput.click({ clickCount: 3 });
  await phoneInput.type('+998901234567');
  console.log('Filled phone: +998901234567');
}
await sleep(300);

// Click submit
const buttons = await page.$$('button');
let submitted = false;
for (const btn of buttons) {
  const text = await btn.evaluate(el => el.textContent.trim());
  if (text === 'Оставить заявку' || text === 'Murojaat yuborish') {
    await btn.click();
    console.log(`Clicked submit: "${text}"`);
    submitted = true;
    break;
  }
}
if (!submitted) {
  const sub = await page.$('button[type="submit"]');
  if (sub) { await sub.click(); submitted = true; console.log('Clicked type=submit'); }
}

await sleep(3000);

// Scroll to see success message
await page.evaluate(() => {
  document.querySelectorAll('*').forEach(el => {
    if (el.scrollHeight > el.clientHeight + 10) el.scrollTop = el.scrollHeight;
  });
});
await sleep(500);

await page.screenshot({ path: `${SS_DIR}/client/07_lead_success.png`, type: 'png' });
console.log(`\n✓ Saved 07_lead_success.png (submitted: ${submitted})`);
console.log(`  File exists: ${existsSync(`${SS_DIR}/client/07_lead_success.png`)}`);

await browser.close();
