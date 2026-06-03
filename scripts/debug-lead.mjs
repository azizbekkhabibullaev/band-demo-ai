/**
 * Debug: inspect DOM state after mortgage message
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5173';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1440,900', '--no-sandbox'],
  defaultViewport: { width: 1440, height: 900 }
});

const page = await browser.newPage();

// Log all network requests to find the 404
page.on('response', response => {
  if (response.status() >= 400) {
    console.log(`[${response.status()}] ${response.url()}`);
  }
});

await page.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(1000);

// Open widget
const allButtons = await page.$$('button');
for (let i = allButtons.length - 1; i >= 0; i--) {
  const box = await allButtons[i].boundingBox();
  if (box && box.x > 1200 && box.y > 750) {
    await allButtons[i].click();
    break;
  }
}

await sleep(5000); // wait for session + greeting

// Send mortgage message
const inp = await page.$('textarea') ?? await page.$('input[type="text"]');
if (inp) {
  await inp.click();
  await inp.type('Хочу взять ипотеку, перезвоните мне пожалуйста');
  await page.keyboard.press('Enter');
}

console.log('Waiting for AI response...');
await sleep(8000);

// Dump the full widget HTML to understand the DOM structure
const domInfo = await page.evaluate(() => {
  // Find the widget container
  const widget = document.querySelector('[class*="widget"], [class*="chat"], [class*="fixed"]');

  // Check for inputs everywhere
  const allInputs = Array.from(document.querySelectorAll('*[type]')).map(el => ({
    tag: el.tagName,
    type: el.getAttribute('type'),
    placeholder: el.getAttribute('placeholder') || '',
    class: el.className || '',
    parentClass: el.parentElement?.className || ''
  }));

  // Get widget HTML
  const widgetDiv = document.querySelector('.fixed') ?? document.querySelector('[class*="z-"]');

  return {
    allTypedElements: allInputs,
    allForms: document.querySelectorAll('form').length,
    allInputTagCount: document.querySelectorAll('input').length,
    allTextareas: document.querySelectorAll('textarea').length,
    bodyText: document.body.innerText.substring(0, 1000),
    // Dump all unique class names that contain 'lead' or 'form' or 'capture'
    leadElements: Array.from(document.querySelectorAll('[class*="lead"], [class*="form"], [class*="capture"]')).map(el => ({
      tag: el.tagName,
      class: el.className
    }))
  };
});

console.log('\n=== DOM State ===');
console.log('All typed elements:', JSON.stringify(domInfo.allTypedElements, null, 2));
console.log('Forms:', domInfo.allForms);
console.log('Inputs:', domInfo.allInputTagCount);
console.log('Textareas:', domInfo.allTextareas);
console.log('Lead-related elements:', JSON.stringify(domInfo.leadElements, null, 2));
console.log('\nBody text (first 1000):\n', domInfo.bodyText);

await browser.close();
