/**
 * Database seed.
 *
 * Creates the organisation, an admin login, the default master lists and
 * (optionally) realistic demo leads so the dashboard has something to show on
 * first run.
 *
 *   npm run seed              -> org + admin + masters
 *   npm run seed -- --demo    -> also inserts ~60 demo leads and activities
 *   npm run seed -- --reset   -> wipes existing data for this org first
 *
 * Safe to run repeatedly: it upserts rather than duplicating.
 */
import { config as loadEnv } from 'dotenv';

// Next.js reads `.env.local` first, so the seed must too — otherwise the app
// and the seed can end up pointing at different databases.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  Organization,
  User,
  Lead,
  Activity,
  Master,
  Counter,
  Notification,
  AuditLog,
  Quotation,
  ImportBatch,
  nextSequence,
  formatCode,
} from '../src/lib/models/index';
import { buildDefaultMasters } from '../src/lib/constants/defaultMasters';
import { pickAvatarColor } from '../src/lib/models/User';
import { computeLeadScore } from '../src/lib/services/leadScore';

const args = process.argv.slice(2);
const WITH_DEMO = args.includes('--demo');
const RESET = args.includes('--reset');

const ORG_NAME = process.env.SEED_ORG_NAME || 'Royal UPVC Doors & Windows';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Admin';
const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || '';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('\nMONGODB_URI is not set.');
    console.error('Copy .env.example to .env.local and add your MongoDB connection string.\n');
    process.exit(1);
  }
  if (!ADMIN_PASSWORD) {
    console.error('\nSEED_ADMIN_PASSWORD is not set in your environment.');
    console.error('Set it in .env.local before seeding — the seed will not invent a password.\n');
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 8) {
    console.error('\nSEED_ADMIN_PASSWORD must be at least 8 characters.\n');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB\n');

  /* ---------------------------- Organisation ---------------------------- */
  const slug = slugify(ORG_NAME);
  let org = await Organization.findOne({ slug });
  if (!org) {
    org = await Organization.create({ name: ORG_NAME, slug });
    console.log(`Created organisation: ${org.name}`);
  } else {
    console.log(`Organisation already exists: ${org.name}`);
  }

  if (RESET) {
    console.log('\n--reset: clearing existing data for this organisation...');
    const orgId = org._id;
    await Promise.all([
      Lead.deleteMany({ organizationId: orgId }),
      Activity.deleteMany({ organizationId: orgId }),
      Quotation.deleteMany({ organizationId: orgId }),
      Notification.deleteMany({ organizationId: orgId }),
      AuditLog.deleteMany({ organizationId: orgId }),
      ImportBatch.deleteMany({ organizationId: orgId }),
      Counter.deleteMany({ organizationId: orgId }),
    ]);
    console.log('   cleared leads, activities, quotations, notifications, logs\n');
  }

  /* ------------------------------- Admin -------------------------------- */
  let admin = await User.findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    admin = await User.create({
      organizationId: org._id,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: 'ADMIN',
      avatarColor: pickAvatarColor(ADMIN_EMAIL),
    });
    console.log(`Created admin user: ${admin.email}`);
  } else {
    console.log(`Admin already exists: ${admin.email}`);
  }

  /* ------------------------------ Masters ------------------------------- */
  const defaults = buildDefaultMasters();
  let created = 0;
  for (const m of defaults) {
    const res = await Master.updateOne(
      { organizationId: org._id, type: m.type, key: m.key },
      {
        $setOnInsert: {
          organizationId: org._id,
          type: m.type,
          key: m.key,
          label: m.label,
          value: m.value,
          color: m.color,
          sortOrder: m.sortOrder,
          isSystem: m.isSystem,
          isActive: true,
        },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
  }
  console.log(`Masters: ${created} created, ${defaults.length - created} already present`);

  /* ------------------------------- Demo --------------------------------- */
  if (WITH_DEMO) {
    const existing = await Lead.countDocuments({ organizationId: org._id });
    if (existing > 0) {
      console.log(`\nSkipping demo data — ${existing} leads already exist (use --reset to replace).`);
    } else {
      await seedDemo(org._id, admin._id, admin.name, org.settings.leadCodePrefix || 'LD');
    }
  }

  await mongoose.disconnect();

  console.log('\n' + '='.repeat(56));
  console.log('SEED COMPLETE');
  console.log('='.repeat(56));
  console.log(`  Organisation : ${ORG_NAME}`);
  console.log(`  Login email  : ${ADMIN_EMAIL}`);
  console.log('  Password     : (the SEED_ADMIN_PASSWORD you set)');
  console.log('='.repeat(56) + '\n');
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * Demo data — realistic for a Hyderabad-area fenestration factory
 * ------------------------------------------------------------------ */
async function seedDemo(
  orgId: mongoose.Types.ObjectId,
  adminId: mongoose.Types.ObjectId,
  adminName: string,
  prefix: string,
) {
  console.log('\nSeeding demo data...');

  const firstNames = ['Ramesh', 'Suresh', 'Praveen', 'Anil', 'Vijay', 'Srinivas', 'Kiran', 'Mahesh', 'Rajesh', 'Naveen', 'Sandeep', 'Harish', 'Deepak', 'Venkat', 'Ravi', 'Sunil', 'Arun', 'Ganesh', 'Manoj', 'Prasad'];
  const lastNames = ['Kumar', 'Reddy', 'Sharma', 'Rao', 'Naidu', 'Verma', 'Gupta', 'Patel', 'Yadav', 'Chowdary'];
  const areas = ['Gachibowli', 'Kondapur', 'Madhapur', 'Kukatpally', 'Miyapur', 'Bachupally', 'Nizampet', 'Manikonda', 'Shamshabad', 'LB Nagar', 'Uppal', 'Kompally'];
  const cities = ['Hyderabad', 'Secunderabad'];

  const sources = ['META_ADS', 'GOOGLE_ADS', 'GMB', 'JUSTDIAL', 'REFERRAL', 'WEBSITE', 'WALK_IN', 'ARCHITECT', 'INDIAMART'] as const;
  const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_DONE', 'QUOTED', 'NEGOTIATION', 'WON', 'LOST'] as const;
  const materials = ['UPVC', 'ALUMINIUM', 'WPC', 'PVC'] as const;
  const products = ['SLIDING_WINDOW', 'CASEMENT_WINDOW', 'SLIDING_DOOR', 'VENTILATOR', 'BATHROOM_DOOR', 'MOSQUITO_MESH', 'FIXED_WINDOW', 'MAIN_DOOR'] as const;
  const propertyTypes = ['INDEPENDENT_HOUSE', 'VILLA', 'APARTMENT', 'COMMERCIAL', 'BUILDER_PROJECT', 'RENOVATION'] as const;
  const constructionStages = ['PLANNING', 'SLAB', 'BRICKWORK', 'PLASTERING', 'FINISHING', 'READY'] as const;
  const timelines = ['IMMEDIATE', 'WITHIN_1_MONTH', 'ONE_TO_THREE_MONTHS', 'THREE_TO_SIX_MONTHS', 'SIX_PLUS_MONTHS'] as const;
  const lostReasons = ['PRICE_TOO_HIGH', 'CHOSE_COMPETITOR', 'PROJECT_POSTPONED', 'NOT_REACHABLE', 'JUST_ENQUIRING'] as const;

  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const pickSome = <T,>(arr: readonly T[], max: number): T[] => {
    const n = 1 + Math.floor(Math.random() * max);
    return Array.from(new Set(Array.from({ length: n }, () => pick(arr))));
  };
  const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);
  const daysAhead = (d: number) => new Date(Date.now() + d * 86400000);
  const hoursAhead = (h: number) => new Date(Date.now() + h * 3600000);

  const TOTAL = 60;
  const leads: Record<string, unknown>[] = [];

  for (let i = 0; i < TOTAL; i++) {
    const seq = await nextSequence(orgId, 'lead');
    const stage = i < 8 ? 'NEW' : pick(stages);
    const createdAt = daysAgo(Math.floor(Math.random() * 75));
    const isClosed = stage === 'WON' || stage === 'LOST';
    const contacted = stage !== 'NEW';

    // Spread follow-ups so the dashboard shows overdue, today and upcoming.
    let nextFollowUpAt: Date | undefined;
    if (!isClosed && contacted) {
      const r = Math.random();
      if (r < 0.22) nextFollowUpAt = daysAgo(1 + Math.floor(Math.random() * 4)); // overdue
      else if (r < 0.45) nextFollowUpAt = hoursAhead(1 + Math.floor(Math.random() * 8)); // today
      else if (r < 0.6) nextFollowUpAt = daysAhead(1); // tomorrow
      else nextFollowUpAt = daysAhead(2 + Math.floor(Math.random() * 20));
    }

    const budgetMin = [50000, 80000, 120000, 200000, 350000][Math.floor(Math.random() * 5)];
    const constructionStage = pick(constructionStages);
    const timeline = pick(timelines);
    const source = pick(sources);
    const decisionMaker = Math.random() > 0.3 ? ('SELF' as const) : ('ARCHITECT' as const);
    const approxAreaSqft = Math.random() > 0.4 ? 200 + Math.floor(Math.random() * 900) : undefined;
    const unitCount = Math.random() > 0.5 ? 4 + Math.floor(Math.random() * 20) : undefined;

    const scored = computeLeadScore({
      timeline,
      constructionStage,
      budgetMax: budgetMin + 100000,
      approxAreaSqft,
      unitCount,
      decisionMaker,
      source,
      stage,
      firstContactedAt: contacted ? new Date() : null,
      contactAttempts: contacted ? 2 : 0,
    });

    leads.push({
      organizationId: orgId,
      leadCode: formatCode(prefix, seq),
      score: scored.score,
      priority: scored.priority,
      name: `${pick(firstNames)} ${pick(lastNames)}`,
      phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      email: Math.random() > 0.6 ? `lead${i}@example.com` : undefined,
      address: {
        area: pick(areas),
        city: pick(cities),
        state: 'Telangana',
        pincode: `50${Math.floor(1000 + Math.random() * 8999)}`,
      },
      materials: pickSome(materials, 2),
      productTypes: pickSome(products, 3),
      approxAreaSqft,
      unitCount,
      propertyType: pick(propertyTypes),
      constructionStage,
      timeline,
      budgetMin,
      budgetMax: budgetMin + 50000 + Math.floor(Math.random() * 150000),
      decisionMaker,
      stage,
      source,
      campaignName: Math.random() > 0.6 ? 'Monsoon Offer 2026' : undefined,
      assignedTo: adminId,
      assignedToName: adminName,
      assignedAt: createdAt,
      firstContactedAt: contacted ? new Date(createdAt.getTime() + 3600000) : undefined,
      lastContactedAt: contacted ? daysAgo(Math.floor(Math.random() * 10)) : undefined,
      nextFollowUpAt,
      nextFollowUpNote: nextFollowUpAt ? pick(['Call to confirm site visit', 'Share revised quotation', 'Check decision status', 'Follow up on advance payment']) : undefined,
      contactAttempts: contacted ? 1 + Math.floor(Math.random() * 4) : 0,
      dealValue: stage === 'WON' ? budgetMin + Math.floor(Math.random() * 100000) : undefined,
      lostReason: stage === 'LOST' ? pick(lostReasons) : undefined,
      requirementNotes: pick([
        'Needs 3-track sliding windows for the front elevation.',
        'Wants toughened glass in the balcony area.',
        'Full house UPVC replacement, 12 windows and 2 doors.',
        'Bathroom doors in WPC, rest in UPVC.',
        'Enquiry for villa project, premium series required.',
      ]),
      createdBy: adminId,
      createdAt,
      updatedAt: createdAt,
    });
  }

  const inserted = await Lead.insertMany(leads, { ordered: false }).catch((e) => {
    // Duplicate random phone numbers are possible; ignore those rows.
    console.log(`   (some duplicate phones skipped)`);
    return (e.insertedDocs || []) as typeof leads;
  });

  const insertedLeads = Array.isArray(inserted) ? inserted : [];
  console.log(`   ${insertedLeads.length} demo leads created`);

  // Activities for the contacted leads.
  const activities = [];
  for (const lead of insertedLeads as unknown as Array<{ _id: mongoose.Types.ObjectId; stage: string; createdAt: Date }>) {
    if (lead.stage === 'NEW') continue;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      activities.push({
        organizationId: orgId,
        leadId: lead._id,
        type: pick(['CALL', 'WHATSAPP', 'NOTE', 'SITE_VISIT'] as const),
        direction: 'OUTGOING' as const,
        outcome: pick(['CONNECTED', 'NOT_ANSWERED', 'CALL_BACK_LATER', 'INTERESTED'] as const),
        body: pick([
          'Discussed requirement and shared approximate pricing.',
          'Customer asked for a site visit next week.',
          'Explained the difference between 2-track and 3-track sliding.',
          'Shared brochure on WhatsApp.',
          'Customer comparing with another vendor.',
        ]),
        status: 'COMPLETED' as const,
        performedBy: adminId,
        performedByName: adminName,
        createdAt: new Date(lead.createdAt.getTime() + (j + 1) * 86400000),
      });
    }
  }
  if (activities.length) {
    await Activity.insertMany(activities, { ordered: false });
    console.log(`   ${activities.length} demo activities created`);
  }

  // Keep the denormalised counter accurate.
  for (const lead of insertedLeads as unknown as Array<{ _id: mongoose.Types.ObjectId }>) {
    const count = activities.filter((a) => String(a.leadId) === String(lead._id)).length;
    if (count) await Lead.updateOne({ _id: lead._id }, { $set: { activityCount: count } });
  }
}

main().catch((err) => {
  console.error('\nSEED FAILED:', err);
  process.exit(1);
});
