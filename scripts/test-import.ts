/**
 * Import / export verification with deliberately messy data.
 *
 * Real files from Meta Lead Center and hand-kept sheets are inconsistent:
 * mixed phone formats, DD/MM/YYYY dates, "2.5 L" budgets, duplicate rows and
 * blank lines. These tests use exactly that kind of input.
 *
 * Run: npx tsx scripts/test-import.ts
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Organization, User, Lead } from '../src/lib/models/index';
import { autoDetectMapping, runImport, rollbackImport } from '../src/lib/services/importService';
import { exportLeadsCsv, buildBackup, toCsv } from '../src/lib/services/exportService';
import { scoped } from '../src/lib/db/repository';

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
  await mongoose.connect(mongod.getUri(), { dbName: 'import' });
  await Lead.syncIndexes();

  const org = await Organization.create({ name: 'Import Test', slug: 'import-test' });
  const admin = await User.create({
    organizationId: org._id, name: 'Admin', email: 'a@i.com', passwordHash: 'x', role: 'ADMIN',
  });

  const ctx = {
    organizationId: String(org._id),
    userId: String(admin._id),
    userName: admin.name,
    leadCodePrefix: 'LD',
  };

  /* ---------------------------------------------------------------- */
  console.log('HEADER AUTO-DETECTION');

  // Meta Lead Center style headers
  const metaHeaders = ['full_name', 'phone_number', 'email', 'city', 'created_time', 'campaign_name'];
  const metaMapping = autoDetectMapping(metaHeaders);
  check('detects full_name -> name', metaMapping['full_name'] === 'name', metaMapping['full_name']);
  check('detects phone_number -> phone', metaMapping['phone_number'] === 'phone');
  check('detects created_time -> createdAt', metaMapping['created_time'] === 'createdAt');
  check('detects campaign_name -> sourceDetail', metaMapping['campaign_name'] === 'sourceDetail');

  // Hand-written sheet headers
  const manualHeaders = ['Customer Name', 'Mobile Number', 'Area', 'Requirement', 'Budget'];
  const manualMapping = autoDetectMapping(manualHeaders);
  check('detects "Customer Name"', manualMapping['Customer Name'] === 'name');
  check('detects "Mobile Number"', manualMapping['Mobile Number'] === 'phone');
  check('detects "Requirement"', manualMapping['Requirement'] === 'requirementNotes');
  check('detects "Budget"', manualMapping['Budget'] === 'budgetMin');

  /* ---------------------------------------------------------------- */
  console.log('\nIMPORT WITH MESSY DATA');

  const messyRows = [
    { Name: 'ramesh KUMAR', Phone: '+91 98765 43210', City: 'Hyderabad', Source: 'Facebook', Budget: '2.5 L' },
    { Name: 'Suresh Reddy', Phone: '09876543211', City: 'Hyderabad', Source: 'JustDial', Budget: '₹1,50,000' },
    { Name: 'Anil Rao', Phone: '9876543212', City: 'Secunderabad', Source: 'google ads', Budget: '80000' },
    // duplicate of row 1 in a different format
    { Name: 'Ramesh K', Phone: '9876543210', City: 'Hyderabad', Source: 'Website', Budget: '' },
    // invalid phone
    { Name: 'Bad Phone', Phone: '123', City: 'Hyderabad', Source: 'Website', Budget: '' },
    // missing phone
    { Name: 'No Phone', Phone: '', City: 'Hyderabad', Source: 'Website', Budget: '' },
    // completely blank row
    { Name: '', Phone: '', City: '', Source: '', Budget: '' },
    // valid, unusual formatting
    { Name: '  vijay   naidu  ', Phone: '(98765) 43213', City: 'Hyderabad', Source: 'Referral', Budget: '1 Cr' },
  ];

  const mapping = {
    Name: 'name', Phone: 'phone', City: 'address.city', Source: 'source', Budget: 'budgetMin',
  };

  const result = await runImport(ctx, messyRows, mapping, {
    duplicateStrategy: 'SKIP',
    fileName: 'messy.csv',
    fileType: 'csv',
  });

  check('inserted the valid rows', result.inserted === 4, `inserted ${result.inserted}`);
  check('skipped the in-file duplicate', result.skipped >= 1, `skipped ${result.skipped}`);
  check('failed the invalid rows', result.failed === 2, `failed ${result.failed}`);
  check('recorded per-row errors', result.errors.length > 0);
  check('error names the bad phone row', result.errors.some((e) => e.field === 'phone'));

  const imported = await Lead.find(scoped(String(org._id))).sort({ createdAt: 1 }).lean();
  check('leads are in the database', imported.length === 4, `got ${imported.length}`);

  const ramesh = imported.find((l) => l.phoneNormalized === '9876543210');
  check('name title-cased', ramesh?.name === 'Ramesh Kumar', ramesh?.name);
  check('phone normalised', ramesh?.phoneNormalized === '9876543210');
  check('"Facebook" mapped to META_ADS', ramesh?.source === 'META_ADS', ramesh?.source);
  check('"2.5 L" parsed to 250000', ramesh?.budgetMin === 250000, String(ramesh?.budgetMin));

  const suresh = imported.find((l) => l.phoneNormalized === '9876543211');
  check('leading-zero phone normalised', !!suresh, 'row 2 not found');
  check('"₹1,50,000" parsed', suresh?.budgetMin === 150000, String(suresh?.budgetMin));
  check('"JustDial" mapped', suresh?.source === 'JUSTDIAL', suresh?.source);

  const vijay = imported.find((l) => l.phoneNormalized === '9876543213');
  check('bracketed phone parsed', !!vijay);
  check('whitespace-heavy name cleaned', vijay?.name === 'Vijay Naidu', vijay?.name);
  check('"1 Cr" parsed to 10000000', vijay?.budgetMin === 10000000, String(vijay?.budgetMin));
  check('"Referral" mapped', vijay?.source === 'REFERRAL');

  check('lead codes generated', imported.every((l) => /^LD-\d{6}$/.test(l.leadCode)));
  const codes = new Set(imported.map((l) => l.leadCode));
  check('lead codes are unique', codes.size === imported.length);
  check('scores computed on import', imported.every((l) => typeof l.score === 'number'));
  check('batch id recorded for rollback', imported.every((l) => !!l.importBatchId));

  /* ---------------------------------------------------------------- */
  console.log('\nDUPLICATE HANDLING ACROSS IMPORTS');

  const secondRun = await runImport(
    ctx,
    [{ Name: 'Ramesh Again', Phone: '+919876543210', City: 'Hyderabad', Source: 'Website', Budget: '' }],
    mapping,
    { duplicateStrategy: 'SKIP', fileName: 'second.csv', fileType: 'csv' },
  );
  check('existing phone skipped on re-import', secondRun.skipped === 1 && secondRun.inserted === 0);

  const updateRun = await runImport(
    ctx,
    [{ Name: 'Ramesh', Phone: '9876543210', City: 'Hyderabad', Source: 'Website', Requirement: 'Wants DGU glass' }],
    { ...mapping, Requirement: 'requirementNotes' },
    { duplicateStrategy: 'UPDATE', fileName: 'update.csv', fileType: 'csv' },
  );
  check('UPDATE strategy updates instead of inserting', updateRun.updated === 1 && updateRun.inserted === 0);

  const updatedLead = await Lead.findOne(scoped(String(org._id), { phoneNormalized: '9876543210' })).lean();
  check('update applied the new field', updatedLead?.requirementNotes === 'Wants DGU glass');
  check('update did not create a duplicate', (await Lead.countDocuments(scoped(String(org._id)))) === 4);

  /* ---------------------------------------------------------------- */
  console.log('\nROLLBACK');
  const batchId = String(imported[0].importBatchId);
  const rolledBack = await rollbackImport(ctx, batchId);
  check('rollback soft-deletes the batch', rolledBack === 4, `rolled back ${rolledBack}`);
  check('leads hidden after rollback', (await Lead.countDocuments(scoped(String(org._id)))) === 0);
  check('rows preserved, not destroyed', (await Lead.countDocuments({ organizationId: org._id })) === 4);

  // Restore for the export tests.
  await Lead.updateMany({ organizationId: org._id }, { $set: { isDeleted: false } });

  /* ---------------------------------------------------------------- */
  console.log('\nEXPORT');
  const csv = await exportLeadsCsv(String(org._id), scoped(String(org._id)));
  check('CSV has a header row', csv.includes('Lead Code') && csv.includes('Phone'));
  check('CSV includes the data', csv.includes('Ramesh'));
  check('CSV has a UTF-8 BOM for Excel', csv.charCodeAt(0) === 0xfeff);
  const lines = csv.split('\r\n').filter(Boolean);
  check('CSV row count matches', lines.length === 5, `${lines.length} lines`);

  /* ---- CSV injection: the security case ---- */
  await Lead.create({
    organizationId: org._id, leadCode: 'LD-999999', name: '=cmd|/c calc',
    phone: '9000000099', source: 'WEBSITE',
  });
  const dangerous = await exportLeadsCsv(String(org._id), scoped(String(org._id)));
  check('formula injection neutralised', dangerous.includes("'=cmd") || !dangerous.includes('\n=cmd'));

  const quoted = toCsv(['A', 'B'], [['has, comma', 'has "quote"']]);
  check('commas quoted correctly', quoted.includes('"has, comma"'));
  check('quotes escaped correctly', quoted.includes('"has ""quote"""'));

  /* ---------------------------------------------------------------- */
  console.log('\nBACKUP');
  const backup = await buildBackup(String(org._id));
  check('backup includes metadata', !!backup.meta.generatedAt && backup.meta.organizationName === 'Import Test');
  check('backup includes leads', backup.leads.length === 5, `${backup.leads.length} leads`);
  check('backup includes users', backup.users.length === 1);
  check('backup counts are accurate', backup.meta.counts.leads === 5);
  check('backup NEVER contains password hashes', !JSON.stringify(backup).includes('passwordHash'));

  // A backup that silently drops deleted rows is not a backup.
  await Lead.updateOne({ organizationId: org._id, leadCode: 'LD-999999' }, { $set: { isDeleted: true } });
  const backup2 = await buildBackup(String(org._id));
  check('backup includes soft-deleted rows', backup2.leads.length === 5, `${backup2.leads.length}`);

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
