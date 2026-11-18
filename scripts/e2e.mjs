/**
 * End-to-end test against a real running server + real MongoDB.
 *
 * A passing `next build` proves the code compiles; it does not prove that a
 * page renders, that auth actually blocks anything, or that the discipline rule
 * fires. This boots the production server against a seeded in-memory database
 * and drives it over HTTP the way a browser would.
 *
 * Run: node scripts/e2e.mjs   (from the project root)
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'child_process';

const mongod = await MongoMemoryServer.create();
const uri = mongod.getUri();
console.log('Mongo:', uri);

const env = {
  ...process.env,
  MONGODB_URI: uri,
  JWT_SECRET: 'e2e-test-secret-key-that-is-long-enough-1234567890',
  SEED_ADMIN_PASSWORD: 'TestPass@12345',
  SEED_ADMIN_EMAIL: 'admin@test.com',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3100',
  PORT: '3100',
};

console.log('\nSeeding...');
await new Promise((r) =>
  spawn('npx', ['tsx', 'scripts/seed.ts', '--demo'], { env, shell: true, stdio: 'inherit' }).on('close', r),
);

console.log('\nStarting server...');
const server = spawn('npx', ['next', 'start', '-p', '3100'], {
  env,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

const base = 'http://localhost:3100';
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(base + '/login');
    if (r.status < 500) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 1000));
}

const results = [];
const t = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`);
};

console.log('\n--- UNAUTHENTICATED ---');
let r = await fetch(base + '/login');
t('login page loads', r.status === 200);
const loginHtml = await r.text();
// The form itself streams in via Suspense, so assert on the server-rendered
// shell plus the password input that is present in the initial HTML.
t('login renders the form', loginHtml.includes('Sign in') && loginHtml.includes('password'));

r = await fetch(base + '/dashboard', { redirect: 'manual' });
t('dashboard redirects when signed out', r.status === 307 || r.status === 302, `got ${r.status}`);
t('redirect points at /login', (r.headers.get('location') || '').includes('/login'));

r = await fetch(base + '/api/leads');
t('API returns 401 when signed out', r.status === 401, `got ${r.status}`);

console.log('\n--- LOGIN ---');
r = await fetch(base + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@test.com', password: 'WrongPassword1' }),
});
t('wrong password rejected', r.status === 401);
const badBody = await r.json();
t('error message does not reveal whether the email exists',
  badBody.error === 'Incorrect email or password', badBody.error);

r = await fetch(base + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@test.com', password: 'TestPass@12345' }),
});
t('correct password accepted', r.status === 200, `got ${r.status}`);

const setCookies = r.headers.getSetCookie?.() || [];
const cookie = setCookies.find((c) => c.startsWith('fcrm_session')) || '';
t('session cookie set', !!cookie);
t('cookie is httpOnly', cookie.toLowerCase().includes('httponly'));
t('cookie is SameSite=Lax', cookie.toLowerCase().includes('samesite=lax'));

const auth = { Cookie: cookie.split(';')[0] };

console.log('\n--- AUTHENTICATED PAGES ---');
for (const [path, marker] of [
  ['/dashboard', 'Hello'],
  ['/leads', 'Leads'],
  ['/follow-ups', 'Follow-ups'],
  ['/pipeline', 'Pipeline'],
  ['/site-visits', 'Site visits'],
  ['/reports', 'Reports'],
  ['/leads/new', 'Add lead'],
  ['/import', 'Import leads'],
  ['/backup', 'Backup'],
  ['/settings', 'Settings'],
  ['/settings/team', 'Team'],
  ['/profile', 'My profile'],
]) {
  const res = await fetch(base + path, { headers: auth });
  const body = await res.text();
  t(`${path} renders`, res.status === 200 && body.includes(marker), `status ${res.status}`);
}

console.log('\n--- API ---');
r = await fetch(base + '/api/leads?limit=5', { headers: auth });
const leads = await r.json();
t('leads list returns data', r.status === 200 && leads.data?.length > 0, `${leads.data?.length} leads`);
t('pagination meta present', leads.meta?.total > 0, `total ${leads.meta?.total}`);

r = await fetch(base + '/api/auth/me', { headers: auth });
const me = await r.json();
t('me returns the profile', me.data?.email === 'admin@test.com');
t('me returns permissions', Array.isArray(me.data?.permissions) && me.data.permissions.length > 0);
t('me never leaks passwordHash', !JSON.stringify(me).includes('passwordHash'));

r = await fetch(base + '/api/leads?followUp=OVERDUE', { headers: auth });
const overdue = await r.json();
t('overdue filter works', r.status === 200, `${overdue.meta?.total} overdue`);

r = await fetch(base + '/api/leads?stage=WON', { headers: auth });
const wonLeads = await r.json();
t('stage filter works', r.status === 200 && wonLeads.data.every((l) => l.stage === 'WON'),
  `${wonLeads.meta?.total} won`);

const sample = leads.data[0];
r = await fetch(base + '/api/leads?q=' + encodeURIComponent(sample.phone), { headers: auth });
const found = await r.json();
t('phone search finds the lead', found.data.some((l) => l._id === sample._id));

console.log('\n--- CREATE & DUPLICATES ---');
r = await fetch(base + '/api/leads', {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'quick', name: 'E2E Test Lead', phone: '9888877776', source: 'WEBSITE' }),
});
const createdLead = await r.json();
t('create lead works', r.status === 201, `got ${r.status} ${createdLead.error || ''}`);
t('lead code generated', /^[A-Z]+-\d{6}$/.test(createdLead.data?.leadCode || ''), createdLead.data?.leadCode);

r = await fetch(base + '/api/leads', {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'quick', name: 'Dup', phone: '+91 98888 77776', source: 'WEBSITE' }),
});
t('duplicate phone rejected across formats', r.status === 409, `got ${r.status}`);

r = await fetch(base + '/api/leads/check-duplicate?phone=9888877776', { headers: auth });
const dupCheck = await r.json();
t('duplicate-check endpoint works', dupCheck.data?.duplicate?.name === 'E2E Test Lead');

console.log('\n--- THE DISCIPLINE RULE ---');
const lid = createdLead.data._id;
r = await fetch(base + `/api/leads/${lid}/activities`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'CALL', outcome: 'CONNECTED', body: 'no next step given' }),
});
t('call WITHOUT a next step is rejected', r.status === 409, `got ${r.status}`);

r = await fetch(base + `/api/leads/${lid}/activities`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'CALL',
    outcome: 'CONNECTED',
    body: 'discussed sliding windows',
    nextFollowUpAt: new Date(Date.now() + 86400000).toISOString(),
  }),
});
t('call WITH a follow-up is accepted', r.status === 201, `got ${r.status}`);

r = await fetch(base + `/api/leads/${lid}`, { headers: auth });
const detail = await r.json();
t('follow-up saved on the lead', !!detail.data?.lead?.nextFollowUpAt);
t('stage auto-advanced NEW -> CONTACTED', detail.data?.lead?.stage === 'CONTACTED', detail.data?.lead?.stage);
t('firstContactedAt recorded', !!detail.data?.lead?.firstContactedAt);
t('timeline has entries', detail.data?.activities?.length > 0, `${detail.data?.activities?.length} entries`);

console.log('\n--- STAGE CHANGES (the single gate) ---');
// A fresh lead to drive stage moves without disturbing the one above.
r = await fetch(base + '/api/leads', {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Stage Flow Test', phone: '9811100022', source: 'WALK_IN' }),
});
const stageLead = await r.json();
const sid = stageLead.data?._id;
t('lead for stage tests created', r.status === 201, `got ${r.status}`);

// The discipline rule must now cover stage moves, not only logged calls.
r = await fetch(base + `/api/leads/${sid}/stage`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ stage: 'QUALIFIED' }),
});
t('open stage move WITHOUT a next step is rejected', r.status === 409, `got ${r.status}`);

r = await fetch(base + `/api/leads/${sid}/stage`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    stage: 'QUALIFIED',
    nextFollowUpAt: new Date(Date.now() + 86400000).toISOString(),
  }),
});
t('open stage move WITH a next step is accepted', r.status === 200, `got ${r.status}`);

r = await fetch(base + `/api/leads/${sid}`, { headers: auth });
const sDetail = await r.json();
t('stage move stamped firstContactedAt', !!sDetail.data?.lead?.firstContactedAt);

// Closing needs no next step, but LOST always needs a reason.
r = await fetch(base + `/api/leads/${sid}/stage`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ stage: 'LOST' }),
});
t('LOST without a reason is rejected', r.status === 422 || r.status === 400, `got ${r.status}`);

r = await fetch(base + `/api/leads/${sid}/stage`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ stage: 'LOST', lostReason: 'PRICE_TOO_HIGH' }),
});
t('LOST with a reason is accepted', r.status === 200, `got ${r.status}`);

r = await fetch(base + `/api/leads/${sid}`, { headers: auth });
const closed = await r.json();
t('closing cleared the pending follow-up', !closed.data?.lead?.nextFollowUpAt);
t('closing stamped lostAt', !!closed.data?.lead?.lostAt);

// Stage must no longer be settable through the generic edit endpoint.
await fetch(base + `/api/leads/${sid}`, {
  method: 'PATCH',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ stage: 'WON' }),
});
const afterStagePatch = await (await fetch(base + `/api/leads/${sid}`, { headers: auth })).json();
t('PATCH cannot change stage', afterStagePatch.data?.lead?.stage === 'LOST', afterStagePatch.data?.lead?.stage);


console.log('\n--- DASHBOARD ALERTS MATCH THEIR LINKS ---');
// Regression guard. Twice an alert counted one set of leads and linked to a
// different one, so the user clicked a number and got something else. Any
// alert that shows a count MUST link to a list containing exactly that many
// leads. If this fails, the count and the filter have drifted apart again.
const dashHtml = await (await fetch(base + '/dashboard', { headers: auth })).text();

const alertCount = (re) => {
  const m = dashHtml.match(re);
  return m ? parseInt(m[1], 10) : null;
};

// 1. "no next step / never been reached" alert
const slaCount = alertCount(/>(\d+)<\/span>[\s\S]{0,120}?no next step/);
if (slaCount === null) {
  t('speed-to-lead alert absent (no breaching leads seeded)', true, 'skipped');
} else {
  const slaList = await (await fetch(base + '/api/leads?slaBreached=true&limit=200', { headers: auth })).json();
  t('alert count equals the list it links to', slaCount === (slaList.meta?.total ?? -1),
    `banner=${slaCount} list=${slaList.meta?.total}`);
  const rows = slaList.data ?? [];
  t('flagged leads have no follow-up booked', rows.every((l) => !l.nextFollowUpAt));
  t('flagged leads have never been reached', rows.every((l) => !l.firstContactedAt));
  t('flagged leads are all still open', rows.every((l) => l.stage !== 'WON' && l.stage !== 'LOST'));
}

// 2. Unassigned alert
const unCount = alertCount(/>(\d+)<\/span>[\s\S]{0,120}?(?:unassigned|not assigned)/i);
if (unCount !== null) {
  const unList = await (await fetch(base + '/api/leads?assignedTo=unassigned&limit=200', { headers: auth })).json();
  t('unassigned alert equals its list', unCount === (unList.meta?.total ?? -1),
    `banner=${unCount} list=${unList.meta?.total}`);
}

// 3. Every alert link on the dashboard must resolve to a working filtered page.
const alertLinks = [...dashHtml.matchAll(/href="(\/leads\?[^"]+)"/g)].map((m) =>
  m[1].replace(/&amp;/g, '&'),
);
let brokenLink = null;
for (const href of new Set(alertLinks)) {
  const res = await fetch(base + href, { headers: auth });
  if (res.status !== 200) { brokenLink = `${href} -> ${res.status}`; break; }
}
t('every dashboard filter link loads', brokenLink === null, brokenLink ?? `${new Set(alertLinks).size} links`);

// 4. An unknown query param must never silently widen a filtered list — the
//    exact failure that made the banner show all leads instead of the five.
const strictA = await (await fetch(base + '/api/leads?slaBreached=true&limit=200', { headers: auth })).json();
const strictB = await (await fetch(base + '/api/leads?slaBreached=true&bogusParam=xyz&limit=200', { headers: auth })).json();
t('unknown params do not widen a filter', (strictA.meta?.total ?? 0) === (strictB.meta?.total ?? -1),
  `${strictA.meta?.total} vs ${strictB.meta?.total}`);

console.log('\n--- VALIDATION & HARDENING ---');
r = await fetch(base + '/api/leads', {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'quick', name: '', phone: '123', source: 'WEBSITE' }),
});
t('invalid input rejected with 422', r.status === 422, `got ${r.status}`);

r = await fetch(base + '/api/leads', {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'quick', name: 'Injection', phone: '9111122223', source: 'WEBSITE',
    score: 100, leadCode: 'HACKED',
  }),
});
t('server-owned fields rejected by strict schema', r.status === 422, `got ${r.status}`);

r = await fetch(base + '/api/leads/notavalidobjectid', { headers: auth });
t('malformed id rejected', r.status === 400 || r.status === 404, `got ${r.status}`);

console.log('\n--- EXPORT & BACKUP ---');
r = await fetch(base + '/api/leads/export?format=csv', { headers: auth });
t('CSV export works', r.status === 200, `got ${r.status}`);
t('CSV sent as a download', (r.headers.get('content-disposition') || '').includes('attachment'));
const csvBody = await r.text();
t('CSV has a header row', csvBody.includes('Lead Code') && csvBody.includes('Phone'));

r = await fetch(base + '/api/leads/export?format=xlsx', { headers: auth });
t('Excel export works', r.status === 200, `got ${r.status}`);
const xlsxBuf = Buffer.from(await r.arrayBuffer());
t('Excel file is a real xlsx (PK zip header)', xlsxBuf[0] === 0x50 && xlsxBuf[1] === 0x4b);

r = await fetch(base + '/api/backup?format=json', { headers: auth });
t('JSON backup works', r.status === 200, `got ${r.status}`);
const backup = await r.json();
t('backup contains leads', backup.leads?.length > 0, `${backup.leads?.length} leads`);
t('backup contains metadata', !!backup.meta?.generatedAt);
t('backup has NO password hashes', !JSON.stringify(backup).includes('passwordHash'));

r = await fetch(base + '/api/backup?format=xlsx', { headers: auth });
t('Excel backup works', r.status === 200, `got ${r.status}`);

r = await fetch(base + '/api/import/template', { headers: auth });
t('import template downloads', r.status === 200);

console.log('\n--- SETTINGS & TEAM ---');
r = await fetch(base + '/api/settings', { headers: auth });
const settingsRes = await r.json();
t('settings readable', r.status === 200 && !!settingsRes.data?.settings);
t('discipline rule ON by default', settingsRes.data?.settings?.requireNextActionOnCall === true);

r = await fetch(base + '/api/settings', {
  method: 'PATCH',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ settings: { leadResponseSlaMinutes: 45 } }),
});
t('settings update works', r.status === 200, `got ${r.status}`);
const afterPatch = await r.json();
t('partial update did not wipe other settings',
  afterPatch.data?.settings?.requireNextActionOnCall === true &&
  afterPatch.data?.settings?.leadResponseSlaMinutes === 45);
t('nested businessHours survived partial update', !!afterPatch.data?.settings?.businessHours?.start);

r = await fetch(base + '/api/team/manage', { headers: auth });
const teamRes = await r.json();
t('team list readable', r.status === 200 && teamRes.data?.length > 0);

// Privilege escalation must be impossible through the API, not just hidden in the UI.
r = await fetch(base + '/api/team/manage', {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Esc', email: 'esc@test.com', password: 'TestPass1234', role: 'SUPER_ADMIN' }),
});
t('SECURITY: cannot create a SUPER_ADMIN', r.status === 422 || r.status === 403, `got ${r.status}`);

r = await fetch(base + '/api/team/manage', {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Peer', email: 'peer@test.com', password: 'TestPass1234', role: 'ADMIN' }),
});
t('SECURITY: admin cannot create a peer admin', r.status === 403, `got ${r.status}`);

r = await fetch(base + '/api/team/manage', {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'New Rep', email: 'rep@test.com', password: 'TestPass1234', role: 'SALES' }),
});
t('admin CAN create a sales user', r.status === 201, `got ${r.status}`);

console.log('\n--- PWA ---');
r = await fetch(base + '/manifest.webmanifest');
t('manifest served', r.status === 200);
const manifest = await r.json();
t('manifest has 192 and 512 icons',
  manifest.icons?.some((i) => i.sizes === '192x192') && manifest.icons?.some((i) => i.sizes === '512x512'));
t('manifest has a maskable icon', manifest.icons?.some((i) => i.purpose === 'maskable'));
t('manifest display is standalone', manifest.display === 'standalone');

r = await fetch(base + '/sw.js');
t('service worker served', r.status === 200);

r = await fetch(base + '/icons/icon-192.png');
const pngBuf = Buffer.from(await r.arrayBuffer());
t('icon is a real PNG', pngBuf[0] === 0x89 && pngBuf[1] === 0x50);

r = await fetch(base + '/offline');
t('offline page renders', r.status === 200);

console.log('\n--- LOGOUT ---');
r = await fetch(base + '/api/auth/logout', { method: 'POST', headers: auth });
t('logout works', r.status === 200);

server.kill();
await mongod.stop();

const failed = results.filter((x) => !x.ok);
console.log(`\n${'='.repeat(52)}`);
console.log(`RESULT: ${results.length - failed.length} passed, ${failed.length} failed`);
console.log('='.repeat(52));

if (failed.length) {
  console.log('\nFailed:');
  failed.forEach((f) => console.log(`  - ${f.name} ${f.detail}`));
  console.log('\nServer log tail:\n', serverLog.slice(-2500));
  process.exit(1);
}
