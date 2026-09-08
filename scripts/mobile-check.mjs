/**
 * Mobile walkthrough on a real Chrome engine with touch emulation.
 *
 * Resizing a desktop window is not the same as a phone: this uses a real device
 * profile (touch events, device pixel ratio, mobile user agent) and walks the
 * screens a salesperson actually uses, capturing a screenshot of each.
 *
 * Run: node scripts/mobile-check.mjs   (server must be running on :3000)
 */
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3000';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// iPhone 14 / Pixel-class viewport — the common case for this client's team.
const PHONE = {
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME });
const page = await browser.newPage();
await page.setViewport(PHONE);
await page.setUserAgent(UA);

const results = [];
const t = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
};

/** No page in a mobile app should scroll sideways. */
async function noOverflow() {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

/**
 * Real controls should meet a ~36px minimum touch height.
 *
 * Inline text links (a brand wordmark, a "View all") are excluded: they are
 * navigation text, not buttons, and padding them out would wreck the layout.
 * What matters is that anything that looks like a button IS thumb-sized.
 */
async function smallTargets() {
  return page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll('button, a, select'));
    return controls
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false; // hidden
        const style = getComputedStyle(el);
        // A "button" has a background, a border, or is a <button>/<select>.
        const looksLikeButton =
          el.tagName !== 'A' ||
          style.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          style.borderTopWidth !== '0px';
        return looksLikeButton && r.height < 36;
      })
      .map((el) => `${el.tagName}: ${(el.textContent || '').trim().slice(0, 24)} (${Math.round(el.getBoundingClientRect().height)}px)`)
      .slice(0, 5);
  });
}

console.log('LOGIN');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
t('login renders on mobile', await page.$('input[type="email"]') !== null);
t('no horizontal scroll', await noOverflow());

// iOS Safari zooms the page if an input font-size is below 16px.
const fontSizes = await page.evaluate(() =>
  Array.from(document.querySelectorAll('input'))
    // Only text-entry fields trigger iOS zoom-on-focus; checkboxes/radios do not.
    .filter((i) => !['checkbox', 'radio', 'submit', 'button'].includes(i.type))
    .map((i) => parseFloat(getComputedStyle(i).fontSize)),
);
t('inputs are >=16px (no iOS zoom-on-focus)', fontSizes.every((f) => f >= 16), `${fontSizes.join(', ')}px`);

await page.type('input[type="email"]', 'admin@royal.com');
await page.type('input[type="password"]', 'Royal@12345');
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle0' }),
  page.click('button[type="submit"]'),
]);
console.log('  signed in\n');

const shots = [];

for (const [path, label] of [
  ['/dashboard', 'dashboard'],
  ['/leads', 'leads'],
  ['/follow-ups', 'followups'],
  ['/pipeline', 'pipeline'],
  ['/leads/new?quick=1', 'quickadd'],
]) {
  console.log(label.toUpperCase());
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 900));

  t(`${path} loads`, page.url().includes(path.split('?')[0]));
  t('no horizontal scroll', await noOverflow());

  const small = await smallTargets();
  t('touch targets are big enough', small.length === 0, small.length ? small.join(' | ') : '');

  const file = `mobile-${label}.png`;
  await page.screenshot({ path: file });
  shots.push(file);
}

/* ---- Bottom navigation ---- */
console.log('BOTTOM NAV');
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 700));

const nav = await page.evaluate(() => {
  const bar = document.querySelector('nav.fixed');
  if (!bar) return null;
  const r = bar.getBoundingClientRect();
  const links = Array.from(bar.querySelectorAll('a, button')).map((a) =>
    (a.textContent || '').trim(),
  );
  return { visible: r.height > 0, bottom: Math.round(r.bottom), links };
});
t('bottom nav is present', nav !== null && nav.visible);
t('bottom nav sits at the screen bottom', nav !== null && Math.abs(nav.bottom - 844) < 6, `${nav?.bottom}px`);
t('has the centre Add button', nav !== null && nav.links.some((l) => l === '' || l === '+'));
console.log(`  nav items: ${nav?.links.filter(Boolean).join(' · ')}`);

/* ---- Call / WhatsApp links are real device links ---- */
console.log('\nDEVICE INTEGRATION');
await page.goto(`${BASE}/leads`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 900));

const links = await page.evaluate(() => {
  const call = document.querySelector('a[href^="tel:"]');
  const wa = document.querySelector('a[href*="wa.me"]');
  return { call: call?.getAttribute('href'), wa: wa?.getAttribute('href') };
});
t('tap-to-call uses a tel: link', !!links.call?.startsWith('tel:+91'), links.call);
t('WhatsApp uses a wa.me link', !!links.wa?.includes('wa.me/91'), links.wa);

/* ---- PWA ---- */
console.log('\nPWA');
const manifestHref = await page.evaluate(
  () => document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
);
t('manifest is linked in the page', !!manifestHref, manifestHref ?? '');

const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
t('app name is Alcove CRM', manifest.name === 'Alcove CRM', manifest.name);
t('home-screen name is short', manifest.short_name.length <= 12, manifest.short_name);

await browser.close();

console.log(`\nScreenshots: ${shots.join(', ')}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${'='.repeat(52)}`);
console.log(`RESULT: ${results.length - failed.length} passed, ${failed.length} failed`);
console.log('='.repeat(52));
if (failed.length) failed.forEach((f) => console.log(`  - ${f.name}`));
