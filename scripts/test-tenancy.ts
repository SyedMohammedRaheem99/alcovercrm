/**
 * Multi-tenant isolation + injection hardening.
 *
 * This is the highest-risk area of the whole product: a leak here means one
 * client can read another client's customer list. These tests simulate a
 * malicious org A trying to reach org B's data.
 *
 * Run: npx tsx scripts/test-tenancy.ts
 */
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Organization, Lead, User } from '../src/lib/models/index';
import { scoped, withOwnership, pickAllowed, LEAD_WRITABLE_FIELDS, toObjectId, safeRegex } from '../src/lib/db/repository';
import { sanitizeMongoInput, csvSafe } from '../src/lib/utils/sanitize';

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

async function main() {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'tenancy' });

  const orgA = await Organization.create({ name: 'Factory A', slug: 'factory-a' });
  const orgB = await Organization.create({ name: 'Factory B', slug: 'factory-b' });

  const salesA = await User.create({
    organizationId: orgA._id, name: 'Sales A', email: 'sa@a.com', passwordHash: 'x', role: 'SALES',
  });
  const salesA2 = await User.create({
    organizationId: orgA._id, name: 'Sales A2', email: 'sa2@a.com', passwordHash: 'x', role: 'SALES',
  });

  await Lead.create({
    organizationId: orgA._id, leadCode: 'A-001', name: 'Org A Customer',
    phone: '9000000001', source: 'WEBSITE', assignedTo: salesA._id, assignedToName: 'Sales A',
  });
  await Lead.create({
    organizationId: orgA._id, leadCode: 'A-002', name: 'Org A Other Rep',
    phone: '9000000002', source: 'WEBSITE', assignedTo: salesA2._id, assignedToName: 'Sales A2',
  });
  const secretB = await Lead.create({
    organizationId: orgB._id, leadCode: 'B-001', name: 'SECRET Org B Customer',
    phone: '9000000003', source: 'WEBSITE',
  });

  console.log('TENANT ISOLATION');

  const aLeads = await Lead.find(scoped(orgA._id));
  check('org A sees only its own leads', aLeads.length === 2, `saw ${aLeads.length}`);
  check('org B data not visible to A', !aLeads.some((l) => l.name.includes('SECRET')));

  const bLeads = await Lead.find(scoped(orgB._id));
  check('org B sees only its own leads', bLeads.length === 1);

  // ATTACK 1: client sends a different organizationId in the filter.
  const attack1 = await Lead.find(scoped(orgA._id, { organizationId: orgB._id }));
  check('ATTACK: forged organizationId is overridden', attack1.length === 2 && !attack1.some((l) => l.name.includes('SECRET')));

  // ATTACK 2: NoSQL operator injection to widen the query.
  const attack2 = await Lead.find(scoped(orgA._id, { organizationId: { $ne: null } }));
  check('ATTACK: $ne operator injection stripped', attack2.length === 2, `saw ${attack2.length}`);

  // ATTACK 3: injection through a normal-looking search field.
  const attack3 = await Lead.find(scoped(orgA._id, { name: { $ne: 'x' } }));
  check('ATTACK: operator in a value field stripped', attack3.length === 2, `saw ${attack3.length}`);

  // ATTACK 4: direct fetch of another tenant's document by id.
  const attack4 = await Lead.findOne(scoped(orgA._id, { _id: secretB._id }));
  check('ATTACK: cross-tenant fetch by id returns nothing', attack4 === null);

  /* ---------------------------------------------------------------- */
  console.log('\nSOFT DELETE');
  const toDelete = aLeads[0];
  toDelete.isDeleted = true;
  await toDelete.save();

  const afterDelete = await Lead.find(scoped(orgA._id));
  check('deleted lead hidden by default', afterDelete.length === 1);

  const withDeleted = await Lead.find(scoped(orgA._id, {}, { includeDeleted: true }));
  check('deleted lead visible when requested', withDeleted.length === 2);
  check('soft delete preserves the row', (await Lead.countDocuments({ organizationId: orgA._id })) === 2);

  toDelete.isDeleted = false;
  await toDelete.save();

  /* ---------------------------------------------------------------- */
  console.log('\nOWNERSHIP (SALES sees only own leads)');
  const ownFilter = withOwnership(scoped(orgA._id), String(salesA._id), false);
  const ownLeads = await Lead.find(ownFilter);
  check('SALES sees only assigned leads', ownLeads.length === 1 && String(ownLeads[0].assignedTo) === String(salesA._id));

  const allFilter = withOwnership(scoped(orgA._id), String(salesA._id), true);
  check('canSeeAll bypasses ownership', (await Lead.find(allFilter)).length === 2);

  /* ---------------------------------------------------------------- */
  console.log('\nMASS ASSIGNMENT PROTECTION');
  const malicious = {
    name: 'Legit Name',
    organizationId: String(orgB._id), // trying to move the lead to another tenant
    leadCode: 'HACKED',
    score: 100,
    isDeleted: true,
    createdBy: 'someone-else',
    stage: 'WON',
  };
  const safe = pickAllowed(malicious, LEAD_WRITABLE_FIELDS);
  check('organizationId stripped', !('organizationId' in safe));
  check('leadCode stripped', !('leadCode' in safe));
  check('score stripped', !('score' in safe));
  check('isDeleted stripped', !('isDeleted' in safe));
  check('createdBy stripped', !('createdBy' in safe));
  check('legitimate fields kept', safe.name === 'Legit Name' && safe.stage === 'WON');

  /* ---------------------------------------------------------------- */
  console.log('\nINPUT SANITISATION');
  const dirty = sanitizeMongoInput({ name: 'ok', $where: 'malicious()', 'a.b': 'dotted', nested: { $gt: 1, fine: 2 } });
  check('$ keys removed', !('$where' in dirty));
  check('dotted keys removed', !('a.b' in dirty));
  check('nested $ keys removed', !('$gt' in (dirty.nested as object)));
  check('legit nested values kept', (dirty.nested as { fine: number }).fine === 2);

  const proto = sanitizeMongoInput({ __proto__: { polluted: true }, ok: 1 } as Record<string, unknown>);
  check('prototype pollution blocked', ({} as Record<string, unknown>).polluted === undefined && proto.ok === 1);

  check('regex metacharacters escaped', safeRegex('a.*b').source === 'a\\.\\*b');
  check('regex still matches literal', safeRegex('C++').test('we use C++ here'));

  check('CSV formula injection neutralised', csvSafe('=cmd|calc').startsWith("'"));
  check('normal CSV value untouched', csvSafe('Ramesh Kumar') === 'Ramesh Kumar');

  /* ---------------------------------------------------------------- */
  console.log('\nOBJECT ID VALIDATION');
  check('valid id accepted', toObjectId(String(orgA._id)) instanceof Types.ObjectId);
  check('garbage id rejected', toObjectId('not-an-id') === null);
  check('empty id rejected', toObjectId('') === null);
  check('null id rejected', toObjectId(null) === null);
  check('injection string rejected', toObjectId('{"$ne":null}') === null);

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
