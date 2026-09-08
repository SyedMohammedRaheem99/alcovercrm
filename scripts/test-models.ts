/**
 * Model integration test against a real (in-memory) MongoDB.
 *
 * Typechecking proves the code compiles; this proves the schemas, hooks and
 * indexes actually behave — duplicate prevention, phone normalisation, atomic
 * code generation, score computation and stage side effects.
 *
 * Run: npx tsx scripts/test-models.ts
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  Organization,
  User,
  Lead,
  Activity,
  Quotation,
  Master,
  ImportBatch,
  AuditLog,
  Notification,
  nextSequence,
  formatCode,
} from '../src/lib/models/index';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'test' });
  console.log('Connected to in-memory MongoDB\n');

  /* ---------------------------------------------------------------- */
  console.log('ORGANIZATION');
  const org = await Organization.create({ name: 'Royal UPVC Doors & Windows', slug: 'royal-upvc' });
  check('creates with defaults', org.currency === 'INR' && org.timezone === 'Asia/Kolkata');
  check('nested settings defaults applied', org.settings.leadResponseSlaMinutes === 30);
  check('requireNextActionOnCall defaults true', org.settings.requireNextActionOnCall === true);
  check('businessHours workingDays default Mon-Sat', org.settings.businessHours.workingDays.length === 6);

  /* ---------------------------------------------------------------- */
  console.log('\nUSER');
  const admin = await User.create({
    organizationId: org._id,
    name: 'Factory Owner',
    email: 'Owner@Example.COM',
    passwordHash: 'fakehash',
    role: 'ADMIN',
  });
  check('email lowercased', admin.email === 'owner@example.com');
  check('avatar colour auto-assigned', /^#[0-9A-F]{6}$/i.test(admin.avatarColor));

  const fetched = await User.findById(admin._id);
  check('passwordHash hidden by default', fetched !== null && fetched.passwordHash === undefined);
  const withHash = await User.findById(admin._id).select('+passwordHash');
  check('passwordHash retrievable when selected', withHash?.passwordHash === 'fakehash');
  check('toJSON strips passwordHash', (withHash?.toJSON() as unknown as Record<string, unknown>)?.passwordHash === undefined);

  let dupUser = false;
  try {
    await User.create({ organizationId: org._id, name: 'X', email: 'owner@example.com', passwordHash: 'h', role: 'SALES' });
  } catch {
    dupUser = true;
  }
  check('duplicate email rejected', dupUser);

  /* ---------------------------------------------------------------- */
  console.log('\nCOUNTER (atomic code generation)');
  const seqs = await Promise.all(
    Array.from({ length: 20 }, () => nextSequence(org._id, 'lead')),
  );
  const unique = new Set(seqs);
  check('20 concurrent sequences all unique', unique.size === 20, `got ${unique.size}`);
  check('sequence starts at 1', Math.min(...seqs) === 1);
  check('formatCode pads correctly', formatCode('LD', 142) === 'LD-000142');

  /* ---------------------------------------------------------------- */
  console.log('\nLEAD — phone normalisation & dedupe');
  await Lead.syncIndexes();

  const lead = await Lead.create({
    organizationId: org._id,
    leadCode: 'LD-000001',
    name: 'Ramesh Kumar',
    phone: '+91 98765 43210',
    source: 'META_ADS',
    createdBy: admin._id,
  });
  check('phone normalised on save', lead.phoneNormalized === '9876543210', lead.phoneNormalized);
  check('defaults applied', lead.stage === 'NEW' && lead.contactAttempts === 0);

  let dupLead = false;
  try {
    await Lead.create({
      organizationId: org._id,
      leadCode: 'LD-000002',
      name: 'Same Person Again',
      phone: '09876543210', // same number, different format
      source: 'WEBSITE',
    });
  } catch {
    dupLead = true;
  }
  check('duplicate phone rejected across formats', dupLead);

  // Same number in a DIFFERENT org must be allowed (multi-tenancy).
  const org2 = await Organization.create({ name: 'Other Factory', slug: 'other' });
  const otherOrgLead = await Lead.create({
    organizationId: org2._id,
    leadCode: 'LD-000001',
    name: 'Different Tenant',
    phone: '9876543210',
    source: 'WEBSITE',
  });
  check('same phone allowed in another org', otherOrgLead.phoneNormalized === '9876543210');

  /* ---------------------------------------------------------------- */
  console.log('\nLEAD — scoring');
  const hotLead = await Lead.create({
    organizationId: org._id,
    leadCode: 'LD-000003',
    name: 'Hot Prospect',
    phone: '9000000001',
    source: 'REFERRAL',
    timeline: 'IMMEDIATE',
    constructionStage: 'FINISHING',
    decisionMaker: 'SELF',
    budgetMax: 300000,
    approxAreaSqft: 800,
  });
  check('hot lead scored HOT', hotLead.priority === 'HOT', `score=${hotLead.score}`);
  check('score within 0-100', hotLead.score > 0 && hotLead.score <= 100);

  const coldLead = await Lead.create({
    organizationId: org._id,
    leadCode: 'LD-000004',
    name: 'Cold Prospect',
    phone: '9000000002',
    source: 'OTHER',
    timeline: 'SIX_PLUS_MONTHS',
    constructionStage: 'PLANNING',
  });
  check('cold lead scored COLD', coldLead.priority === 'COLD', `score=${coldLead.score}`);

  /* ---------------------------------------------------------------- */
  console.log('\nLEAD — stage side effects');
  hotLead.nextFollowUpAt = new Date();
  hotLead.stage = 'WON';
  hotLead.dealValue = 250000;
  await hotLead.save();
  check('wonAt set on WON', !!hotLead.wonAt);
  check('customerSince set on WON', !!hotLead.customerSince);
  check('follow-up cleared on WON', hotLead.nextFollowUpAt === undefined);

  coldLead.stage = 'LOST';
  coldLead.lostReason = 'NOT_REACHABLE';
  await coldLead.save();
  check('lostAt set on LOST', !!coldLead.lostAt);

  // Re-open a lost lead
  coldLead.stage = 'CONTACTED';
  await coldLead.save();
  check('lostAt cleared on reopen', coldLead.lostAt === undefined);
  check('lostReason cleared on reopen', coldLead.lostReason === undefined);

  /* ---------------------------------------------------------------- */
  console.log('\nACTIVITY');
  const act = await Activity.create({
    organizationId: org._id,
    leadId: lead._id,
    type: 'CALL',
    direction: 'OUTGOING',
    outcome: 'CONNECTED',
    body: 'Discussed 3-track sliding windows',
    performedBy: admin._id,
    performedByName: admin.name,
  });
  check('activity created', act.type === 'CALL');
  check('completedAt auto-set when COMPLETED', !!act.completedAt);

  const visit = await Activity.create({
    organizationId: org._id,
    leadId: lead._id,
    type: 'SITE_VISIT',
    status: 'PENDING',
    scheduledAt: new Date(Date.now() + 86400000),
    performedByName: 'Owner',
  });
  check('pending site visit has no completedAt', !visit.completedAt);

  /* ---------------------------------------------------------------- */
  console.log('\nQUOTATION — server-side totals');
  const quote = await Quotation.create({
    organizationId: org._id,
    leadId: lead._id,
    quotationNumber: 'QT-2026-0001',
    items: [
      { description: '3 Track Sliding Window', quantity: 4, amount: 40000 },
      { description: 'Casement Window', quantity: 2, amount: 20000 },
    ],
    discount: 10,
    discountType: 'PERCENT',
    taxPercent: 18,
    // deliberately NOT sending grandTotal — server must compute it
  });
  check('subtotal computed from items', quote.subtotal === 60000, `got ${quote.subtotal}`);
  // 60000 - 10% = 54000; +18% tax = 63720
  check('grandTotal computed with discount+tax', quote.grandTotal === 63720, `got ${quote.grandTotal}`);

  const tampered = await Quotation.create({
    organizationId: org._id,
    leadId: lead._id,
    quotationNumber: 'QT-2026-0002',
    items: [{ description: 'X', quantity: 1, amount: 1000 }],
    grandTotal: 1, // client tries to force a bogus total
  });
  check('client-supplied grandTotal overridden', tampered.grandTotal === 1000, `got ${tampered.grandTotal}`);

  /* ---------------------------------------------------------------- */
  console.log('\nOTHER COLLECTIONS');
  const master = await Master.create({
    organizationId: org._id,
    type: 'WHATSAPP_TEMPLATE',
    key: 'intro',
    label: 'Intro message',
    value: 'Hello {{name}}, thanks for your enquiry!',
  });
  check('master created', master.isActive === true);

  const batch = await ImportBatch.create({
    organizationId: org._id,
    fileName: 'leads.csv',
    fileType: 'csv',
    totalRows: 10,
    rowErrors: [{ row: 3, reason: 'Invalid phone' }],
  });
  check('import batch stores row errors', batch.rowErrors.length === 1);

  const audit = await AuditLog.create({
    organizationId: org._id,
    userId: admin._id,
    action: 'LOGIN',
    success: true,
  });
  check('audit log created', audit.action === 'LOGIN');

  const notif = await Notification.create({
    organizationId: org._id,
    userId: admin._id,
    type: 'FOLLOW_UP_DUE',
    title: 'Follow-up due',
  });
  check('notification created', notif.isRead === false);

  /* ---------------------------------------------------------------- */
  console.log('\nINDEXES');
  const leadIdx = await Lead.collection.indexes();
  const names = leadIdx.map((i) => i.name);
  check('text search index exists', names.includes('lead_text_search'));
  check('follow-up index exists', leadIdx.some((i) => JSON.stringify(i.key).includes('nextFollowUpAt')));
  check('unique phone index is partial', leadIdx.some((i) => i.unique && i.partialFilterExpression));
  console.log(`  (${leadIdx.length} indexes on leads)`);

  /* ---------------------------------------------------------------- */
  console.log('\nSTRICT MODE (mass-assignment protection)');
  const sneaky = await Lead.create({
    organizationId: org._id,
    leadCode: 'LD-000009',
    name: 'Strict Test',
    phone: '9000000009',
    source: 'WEBSITE',
    hackerField: 'should not persist',
  } as unknown as Record<string, unknown>);
  check('unknown fields stripped', !(sneaky as unknown as Record<string, unknown>).hackerField);

  /* ---------------------------------------------------------------- */
  await mongoose.disconnect();
  await mongod.stop();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
