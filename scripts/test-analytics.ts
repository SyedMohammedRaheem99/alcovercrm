/**
 * Analytics verification.
 *
 * Aggregation pipelines are easy to get subtly wrong (a $match that silently
 * matches nothing, a timezone-shifted day boundary, a conversion rate divided
 * by the wrong denominator). These tests build a known dataset and assert the
 * exact numbers that must come back.
 *
 * Run: npx tsx scripts/test-analytics.ts
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Organization, User, Lead, Activity } from '../src/lib/models/index';
import {
  getDashboardSummary,
  getBreakdowns,
  getLeadTrend,
  getSourcePerformance,
  getTeamPerformance,
  type AnalyticsContext,
} from '../src/lib/services/analytics';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);
const hoursAhead = (h: number) => new Date(Date.now() + h * 3600000);

async function main() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'analytics' });

  const org = await Organization.create({ name: 'Test Factory', slug: 'test-factory' });
  const otherOrg = await Organization.create({ name: 'Other', slug: 'other' });

  const rep1 = await User.create({
    organizationId: org._id, name: 'Rep One', email: 'r1@t.com', passwordHash: 'x', role: 'SALES',
  });
  const rep2 = await User.create({
    organizationId: org._id, name: 'Rep Two', email: 'r2@t.com', passwordHash: 'x', role: 'SALES',
  });

  let seq = 0;
  const mk = (over: Record<string, unknown>) => ({
    organizationId: org._id,
    leadCode: `T-${String(++seq).padStart(4, '0')}`,
    phone: `90000${String(seq).padStart(5, '0')}`,
    name: `Lead ${seq}`,
    source: 'META_ADS',
    ...over,
  });

  /* ---- A precisely known dataset ---- */
  await Lead.insertMany([
    // 2 overdue follow-ups
    mk({ nextFollowUpAt: hoursAgo(5), stage: 'CONTACTED', createdAt: hoursAgo(31), firstContactedAt: hoursAgo(30), assignedTo: rep1._id, assignedToName: 'Rep One' }),
    mk({ nextFollowUpAt: daysAgo(2), stage: 'QUOTED', createdAt: hoursAgo(52), firstContactedAt: hoursAgo(50), assignedTo: rep1._id, assignedToName: 'Rep One' }),
    // 1 due later today
    mk({ nextFollowUpAt: hoursAhead(3), stage: 'CONTACTED', createdAt: hoursAgo(21), firstContactedAt: hoursAgo(20), assignedTo: rep2._id, assignedToName: 'Rep Two' }),
    // 2 never contacted, created long ago -> SLA breach
    mk({ stage: 'NEW', createdAt: hoursAgo(10) }),
    mk({ stage: 'NEW', createdAt: hoursAgo(8) }),
    // 2 won with values
    mk({ stage: 'WON', dealValue: 200000, wonAt: daysAgo(3), createdAt: daysAgo(11), firstContactedAt: daysAgo(10), assignedTo: rep1._id, assignedToName: 'Rep One', source: 'REFERRAL' }),
    mk({ stage: 'WON', dealValue: 300000, wonAt: daysAgo(1), createdAt: daysAgo(9), firstContactedAt: daysAgo(8), assignedTo: rep2._id, assignedToName: 'Rep Two', source: 'REFERRAL' }),
    // 2 lost
    mk({ stage: 'LOST', lostReason: 'PRICE_TOO_HIGH', lostAt: daysAgo(2), createdAt: daysAgo(10), firstContactedAt: daysAgo(9), assignedTo: rep1._id, assignedToName: 'Rep One' }),
    mk({ stage: 'LOST', lostReason: 'CHOSE_COMPETITOR', lostAt: daysAgo(4), createdAt: daysAgo(12), firstContactedAt: daysAgo(11), assignedTo: rep2._id, assignedToName: 'Rep Two' }),
    // 1 open with a budget range (pipeline value uses the midpoint: 150000)
    mk({ stage: 'NEGOTIATION', budgetMin: 100000, budgetMax: 200000, createdAt: daysAgo(6), firstContactedAt: daysAgo(5), assignedTo: rep1._id, assignedToName: 'Rep One' }),
  ]);

  // Another tenant's data — must never appear in any figure.
  await Lead.create({
    organizationId: otherOrg._id, leadCode: 'X-1', name: 'Other Tenant', phone: '9999999999',
    source: 'WEBSITE', stage: 'WON', dealValue: 9999999, wonAt: daysAgo(1),
  });

  await Activity.insertMany([
    { organizationId: org._id, leadId: (await Lead.findOne({ organizationId: org._id }))!._id, type: 'CALL', performedBy: rep1._id, performedByName: 'Rep One', status: 'COMPLETED' },
    { organizationId: org._id, leadId: (await Lead.findOne({ organizationId: org._id }))!._id, type: 'CALL', performedBy: rep1._id, performedByName: 'Rep One', status: 'COMPLETED' },
    { organizationId: org._id, leadId: (await Lead.findOne({ organizationId: org._id }))!._id, type: 'SITE_VISIT', performedBy: rep2._id, performedByName: 'Rep Two', status: 'PENDING', scheduledAt: hoursAhead(4) },
  ]);

  const ctx: AnalyticsContext = {
    organizationId: String(org._id),
    userId: String(rep1._id),
    seesAllLeads: true,
    timezone: 'Asia/Kolkata',
    slaMinutes: 30,
  };

  /* ---------------------------------------------------------------- */
  console.log('DASHBOARD SUMMARY');
  const s = await getDashboardSummary(ctx);

  check('total excludes other tenants', s.counts.total === 10, `got ${s.counts.total}`);
  check('overdue follow-ups counted', s.followUps.overdue === 2, `got ${s.followUps.overdue}`);
  check('due today counted', s.followUps.today === 1, `got ${s.followUps.today}`);
  check('won counted', s.counts.won === 2, `got ${s.counts.won}`);
  check('lost counted', s.counts.lost === 2, `got ${s.counts.lost}`);
  check('open counted', s.counts.open === 6, `got ${s.counts.open}`);
  check('uncontacted counted', s.alerts.uncontacted === 2, `got ${s.alerts.uncontacted}`);
  check('SLA breaches counted', s.alerts.slaBreached === 2, `got ${s.alerts.slaBreached}`);
  check('unassigned counted', s.alerts.unassigned === 2, `got ${s.alerts.unassigned}`);

  check('won value total correct', s.value.wonValueTotal === 500000, `got ${s.value.wonValueTotal}`);
  check('other tenant value excluded', s.value.wonValueTotal !== 9999999 + 500000);
  check('pipeline uses budget midpoint', s.value.pipelineValue === 150000, `got ${s.value.pipelineValue}`);

  // 2 won of 4 decided = 50%. Critically NOT 2/10 = 20%.
  check('conversion uses decided leads', s.conversionRate === 50, `got ${s.conversionRate}`);
  check('avg response time computed', s.avgResponseMinutes !== null && s.avgResponseMinutes > 0, `got ${s.avgResponseMinutes}`);
  check('avg response time is never negative', (s.avgResponseMinutes ?? 0) >= 0, `got ${s.avgResponseMinutes}`);
  check('site visits today counted', s.siteVisitsToday === 1, `got ${s.siteVisitsToday}`);

  /* ---------------------------------------------------------------- */
  console.log('\nBREAKDOWNS');
  const b = await getBreakdowns(ctx);
  const stageTotal = b.byStage.reduce((sum, x) => sum + x.count, 0);
  check('stage buckets sum to total', stageTotal === 10, `got ${stageTotal}`);

  const referral = b.bySource.find((x) => x.key === 'REFERRAL');
  check('source grouping correct', referral?.count === 2, `got ${referral?.count}`);

  check('lost reasons captured', b.lostReasons.length === 2, `got ${b.lostReasons.length}`);
  const priceReason = b.lostReasons.find((x) => x.key === 'PRICE_TOO_HIGH');
  check('lost reason counts correct', priceReason?.count === 1);

  /* ---------------------------------------------------------------- */
  console.log('\nTREND');
  const trend = await getLeadTrend(ctx, 7);
  check('returns one point per day', trend.length === 7, `got ${trend.length}`);
  check('points are date-ordered', trend[0].date < trend[6].date);
  check('includes zero days (no gaps)', trend.every((p) => typeof p.created === 'number'));
  const wonInTrend = trend.reduce((sum, p) => sum + p.won, 0);
  check('won leads appear in trend', wonInTrend === 2, `got ${wonInTrend}`);

  /* ---------------------------------------------------------------- */
  console.log('\nSOURCE PERFORMANCE');
  const sources = await getSourcePerformance(ctx);
  const ref = sources.find((x) => x.source === 'REFERRAL');
  check('referral total correct', ref?.total === 2, `got ${ref?.total}`);
  check('referral won correct', ref?.won === 2);
  check('referral conversion is 100%', ref?.conversionRate === 100, `got ${ref?.conversionRate}`);
  check('referral value correct', ref?.wonValue === 500000, `got ${ref?.wonValue}`);

  const meta = sources.find((x) => x.source === 'META_ADS');
  // META has 2 won? No — both wins are REFERRAL. META has 0 won, 2 lost -> 0%.
  check('meta conversion is 0%', meta?.conversionRate === 0, `got ${meta?.conversionRate}`);

  /* ---------------------------------------------------------------- */
  console.log('\nTEAM PERFORMANCE');
  const team = await getTeamPerformance(ctx);
  check('both reps returned', team.length === 2, `got ${team.length}`);

  const r1 = team.find((t) => t.userId === String(rep1._id));
  check('rep1 assigned count', r1?.assigned === 5, `got ${r1?.assigned}`);
  check('rep1 won count', r1?.won === 1, `got ${r1?.won}`);
  check('rep1 overdue count', r1?.overdue === 2, `got ${r1?.overdue}`);
  check('rep1 activity count', r1?.activities === 2, `got ${r1?.activities}`);
  check('denormalised name resolved', r1?.name === 'Rep One');

  /* ---------------------------------------------------------------- */
  console.log('\nOWNERSHIP SCOPING (SALES sees only own)');
  const ownCtx: AnalyticsContext = { ...ctx, seesAllLeads: false };
  const ownSummary = await getDashboardSummary(ownCtx);
  check('rep1 sees only own leads', ownSummary.counts.total === 5, `got ${ownSummary.counts.total}`);
  check('rep1 sees own overdue only', ownSummary.followUps.overdue === 2, `got ${ownSummary.followUps.overdue}`);
  check('rep1 won value scoped', ownSummary.value.wonValueTotal === 200000, `got ${ownSummary.value.wonValueTotal}`);

  await mongoose.disconnect();
  await mongod.stop();

  console.log('\n' + '='.repeat(50));
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
