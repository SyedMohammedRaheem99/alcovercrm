/**
 * Visual check of the Call / WhatsApp button widths.
 *
 * The CSS audit proved the classes exist; this proves the rendered geometry is
 * actually right at desktop and mobile widths. Measuring the real DOM is the
 * only way to be sure a layout fix landed.
 *
 * Run: node scripts/visual-check.mjs   (server must be running on :3000)
 */
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';

const browser = await puppeteer.launch({
  headless: 'new',
  // Use the Chrome already installed on this machine rather than downloading
  // a second copy of Chromium.
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage();

// Sign in.
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await page.type('input[type="email"]', 'admin@royal.com');
await page.type('input[type="password"]', 'Royal@12345');
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle0' }),
  page.click('button[type="submit"]'),
]);
console.log('Signed in\n');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
};

/** Measure the first Call / WhatsApp pair on the page. */
async function measure(label) {
  return page.evaluate(() => {
    const byText = (t) =>
      Array.from(document.querySelectorAll('a, button')).find(
        (el) => el.textContent.trim() === t,
      );
    const call = byText('Call');
    const wa = byText('WhatsApp');
    return {
      viewport: window.innerWidth,
      call: call ? Math.round(call.getBoundingClientRect().width) : null,
      whatsapp: wa ? Math.round(wa.getBoundingClientRect().width) : null,
    };
  });
}

/* ---------------- Leads list ---------------- */
console.log('LEADS LIST — desktop 1440px');
await page.goto(`${BASE}/leads`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));

let m = await measure();
console.log(`  Call: ${m.call}px · WhatsApp: ${m.whatsapp}px`);
check('Call button is a sensible width (not stretched)', m.call !== null && m.call < 200, `${m.call}px`);
check('WhatsApp button is a sensible width', m.whatsapp !== null && m.whatsapp < 200, `${m.whatsapp}px`);

/* ---------------- Lead detail ---------------- */
console.log('\nLEAD DETAIL — desktop 1440px');
const leadHref = await page.evaluate(() => {
  const a = document.querySelector('a[href^="/leads/"][href$=""]:not([href="/leads/new"])');
  return a ? a.getAttribute('href') : null;
});
if (leadHref) {
  await page.goto(`${BASE}${leadHref}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));
  m = await measure();
  console.log(`  Call: ${m.call}px · WhatsApp: ${m.whatsapp}px`);
  check('detail Call button not stretched', m.call !== null && m.call < 260, `${m.call}px`);
  check('detail WhatsApp button not stretched', m.whatsapp !== null && m.whatsapp < 260, `${m.whatsapp}px`);
}

/* ---------------- Mobile ---------------- */
console.log('\nMOBILE — 390px (iPhone width)');
await page.setViewport({ width: 390, height: 844, isMobile: true });
await page.goto(`${BASE}/leads`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));

m = await measure();
console.log(`  Call: ${m.call}px · WhatsApp: ${m.whatsapp}px`);
// On a 390px screen the buttons SHOULD be wide — that is the point on mobile.
check('mobile Call button is comfortably tappable', m.call !== null && m.call > 90, `${m.call}px`);
check('mobile WhatsApp button is comfortably tappable', m.whatsapp !== null && m.whatsapp > 90, `${m.whatsapp}px`);

const noOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth <= window.innerWidth + 1,
);
check('no horizontal overflow on mobile', noOverflow);

/* ---------------- Screenshots ---------------- */
await page.setViewport({ width: 1440, height: 900 });
await page.goto(`${BASE}/leads`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: 'desktop-leads.png' });

await page.setViewport({ width: 390, height: 844, isMobile: true });
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: 'mobile-leads.png' });

console.log('\nScreenshots: desktop-leads.png, mobile-leads.png');

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${'='.repeat(50)}`);
console.log(`RESULT: ${results.length - failed.length} passed, ${failed.length} failed`);
console.log('='.repeat(50));
process.exit(failed.length ? 1 : 0);
