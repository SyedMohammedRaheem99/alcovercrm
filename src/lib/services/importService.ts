import { Types } from 'mongoose';
import { Lead, ImportBatch, User, nextSequence, formatCode } from '@/lib/models';
import { scoped } from '@/lib/db/repository';
import { normalizePhone, isPlausiblePhone } from '@/lib/utils/phone';
import { cleanString, toTitleCase, normalizeEmail } from '@/lib/utils/sanitize';
import { computeLeadScore } from '@/lib/services/leadScore';
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  MATERIALS,
  PRODUCT_TYPES,
  PROPERTY_TYPES,
  TIMELINES,
  type LeadSource,
  type LeadStage,
} from '@/lib/constants/enums';
import type { DuplicateStrategy } from '@/lib/constants/enums';

/**
 * CSV / Excel import.
 *
 * The realistic input here is a Meta Lead Center export or a hand-kept sheet —
 * inconsistent headers, phone numbers in five formats, and duplicates. So the
 * importer is forgiving about shape and strict about data: it auto-detects
 * columns, normalises everything, and records a per-row error report rather
 * than failing the whole file on one bad line.
 */

export interface ParsedRow {
  [key: string]: string | number | null | undefined;
}

export interface ImportResult {
  batchId: string;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; field?: string; value?: string; reason: string }>;
}

/** Header aliases seen in real exports, mapped to our field names. */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'full name', 'fullname', 'customer name', 'client name', 'lead name', 'contact name', 'full_name'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number', 'phone_number', 'primary phone'],
  altPhone: ['alt phone', 'alternate phone', 'secondary phone', 'phone 2', 'alternate number'],
  email: ['email', 'email address', 'e-mail', 'email_address'],
  'address.city': ['city', 'town', 'city name'],
  'address.area': ['area', 'locality', 'location', 'region', 'neighbourhood'],
  'address.line1': ['address', 'address line 1', 'street', 'address1'],
  'address.pincode': ['pincode', 'pin code', 'postal code', 'zip', 'zipcode'],
  source: ['source', 'lead source', 'channel', 'platform'],
  sourceDetail: ['campaign', 'campaign name', 'ad name', 'adset name', 'ad set name', 'source detail'],
  requirementNotes: ['notes', 'note', 'requirement', 'requirements', 'message', 'comments', 'remarks', 'description'],
  stage: ['stage', 'status', 'lead status'],
  budgetMin: ['budget', 'budget min', 'minimum budget', 'budget from'],
  budgetMax: ['budget max', 'maximum budget', 'budget to'],
  approxAreaSqft: ['area sqft', 'sqft', 'square feet', 'approx area'],
  unitCount: ['units', 'quantity', 'no of windows', 'number of units'],
  createdAt: ['created', 'created at', 'date', 'created time', 'lead date', 'enquiry date', 'created_time'],
};

/** Guess a column mapping from the uploaded header row. */
export function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const header of headers) {
    const normalized = header.toLowerCase().trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (used.has(field)) continue;
      if (aliases.includes(normalized)) {
        mapping[header] = field;
        used.add(field);
        break;
      }
    }
  }

  // Second pass: fuzzy contains-match for anything still unmapped.
  for (const header of headers) {
    if (mapping[header]) continue;
    const normalized = header.toLowerCase().trim();

    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (used.has(field)) continue;
      if (aliases.some((a) => normalized.includes(a) || a.includes(normalized))) {
        mapping[header] = field;
        used.add(field);
        break;
      }
    }
  }

  return mapping;
}

/** Match a free-text source value against our enum, falling back to OTHER. */
function coerceSource(raw: string | undefined): LeadSource {
  if (!raw) return 'OTHER';
  const value = raw.toUpperCase().replace(/[\s-]+/g, '_');

  if ((LEAD_SOURCES as readonly string[]).includes(value)) return value as LeadSource;

  const text = raw.toLowerCase();
  if (text.includes('facebook') || text.includes('instagram') || text.includes('meta') || text.includes('fb')) return 'META_ADS';
  if (text.includes('google') && text.includes('business')) return 'GMB';
  if (text.includes('google') || text.includes('adwords')) return 'GOOGLE_ADS';
  if (text.includes('justdial') || text.includes('jd')) return 'JUSTDIAL';
  if (text.includes('indiamart')) return 'INDIAMART';
  if (text.includes('sulekha')) return 'SULEKHA';
  if (text.includes('whatsapp')) return 'WHATSAPP';

  // Distance-tagged online campaigns, e.g. "Online 20km", "online-10 km".
  if (text.includes('online')) {
    if (text.includes('20')) return 'ONLINE_20KM';
    if (text.includes('10')) return 'ONLINE_10KM';
    if (text.includes('new')) return 'ONLINE_NEW';
    return 'ONLINE_NEW';
  }

  if (text.includes('website') || text.includes('web')) return 'WEBSITE';
  if (text.includes('refer')) return 'REFERRAL';
  if (text.includes('walk')) return 'WALK_IN';
  if (text.includes('architect')) return 'ARCHITECT';
  if (text.includes('builder')) return 'BUILDER';

  return 'OTHER';
}

function coerceStage(raw: string | undefined): LeadStage {
  if (!raw) return 'NEW';
  const value = raw.toUpperCase().replace(/[\s-]+/g, '_');
  return (LEAD_STAGES as readonly string[]).includes(value) ? (value as LeadStage) : 'NEW';
}

function coerceEnumList(raw: string | undefined, allowed: readonly string[]): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;/|]+/)
    .map((part) => part.trim().toUpperCase().replace(/[\s-]+/g, '_'))
    .filter((part) => allowed.includes(part));
}

function coerceNumber(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  // Strip currency symbols, commas and Indian "Lakh"/"L" suffixes.
  const text = String(raw).replace(/[₹,\s]/g, '');
  const lakhMatch = text.match(/^([\d.]+)\s*(l|lakh|lakhs)$/i);
  if (lakhMatch) return Math.round(parseFloat(lakhMatch[1]) * 100000);
  const croreMatch = text.match(/^([\d.]+)\s*(cr|crore|crores)$/i);
  if (croreMatch) return Math.round(parseFloat(croreMatch[1]) * 10000000);
  const n = Number(text.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function coerceDate(raw: unknown): Date | undefined {
  if (!raw) return undefined;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? undefined : raw;

  const text = String(raw).trim();

  // Excel serial date (days since 1899-12-30).
  if (/^\d{5}$/.test(text)) {
    const serial = Number(text);
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  // Prefer DD/MM/YYYY — Indian sheets use it, and JS would read it as US M/D/Y.
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const parsed = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Read a mapped value out of a row. */
function getValue(row: ParsedRow, mapping: Record<string, string>, field: string): string | undefined {
  for (const [header, mapped] of Object.entries(mapping)) {
    if (mapped === field) {
      const value = row[header];
      if (value === null || value === undefined || value === '') return undefined;
      return String(value).trim();
    }
  }
  return undefined;
}

export interface ImportContext {
  organizationId: string;
  userId: string;
  userName: string;
  leadCodePrefix: string;
}

export async function runImport(
  ctx: ImportContext,
  rows: ParsedRow[],
  mapping: Record<string, string>,
  options: {
    duplicateStrategy: DuplicateStrategy;
    defaults?: Record<string, unknown>;
    fileName: string;
    fileType: string;
  },
): Promise<ImportResult> {
  const batch = await ImportBatch.create({
    organizationId: new Types.ObjectId(ctx.organizationId),
    fileName: options.fileName,
    fileType: options.fileType,
    totalRows: rows.length,
    duplicateStrategy: options.duplicateStrategy,
    mapping,
    defaults: options.defaults,
    status: 'PROCESSING',
    startedAt: new Date(),
    importedBy: new Types.ObjectId(ctx.userId),
    importedByName: ctx.userName,
  });

  const errors: ImportResult['errors'] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  // Pre-load existing phone numbers in ONE query. Checking per row would be
  // N round trips and would time out on a large file.
  const existing = await Lead.find(scoped(ctx.organizationId))
    .select('phoneNormalized')
    .lean();
  const existingPhones = new Map(existing.map((l) => [l.phoneNormalized, String(l._id)]));

  // Also guards against duplicates *within the same file*.
  const seenInFile = new Set<string>();

  const defaultAssignee = options.defaults?.assignedTo as string | undefined;
  let defaultAssigneeName: string | undefined;
  if (defaultAssignee && Types.ObjectId.isValid(defaultAssignee)) {
    const assignee = await User.findOne({
      _id: defaultAssignee,
      organizationId: ctx.organizationId,
      isDeleted: false,
    })
      .select('name')
      .lean();
    defaultAssigneeName = assignee?.name;
  }

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // +1 for zero-index, +1 for the header row
    const row = rows[i];

    try {
      const name = cleanString(getValue(row, mapping, 'name'));
      const phoneRaw = getValue(row, mapping, 'phone');

      if (!name && !phoneRaw) {
        skipped++; // entirely blank row
        continue;
      }
      if (!phoneRaw) {
        failed++;
        errors.push({ row: rowNumber, field: 'phone', reason: 'Phone number is missing' });
        continue;
      }
      if (!isPlausiblePhone(phoneRaw)) {
        failed++;
        errors.push({ row: rowNumber, field: 'phone', value: phoneRaw, reason: 'Phone number is not valid' });
        continue;
      }

      const phoneNormalized = normalizePhone(phoneRaw);

      if (seenInFile.has(phoneNormalized)) {
        skipped++;
        errors.push({ row: rowNumber, field: 'phone', value: phoneRaw, reason: 'Duplicate within this file' });
        continue;
      }

      const existingId = existingPhones.get(phoneNormalized);

      if (existingId) {
        if (options.duplicateStrategy === 'SKIP') {
          skipped++;
          continue;
        }
        if (options.duplicateStrategy === 'UPDATE') {
          const update: Record<string, unknown> = { updatedBy: new Types.ObjectId(ctx.userId) };
          const notes = getValue(row, mapping, 'requirementNotes');
          if (notes) update.requirementNotes = notes;
          const email = getValue(row, mapping, 'email');
          if (email) update.email = normalizeEmail(email);

          await Lead.updateOne(
            scoped(ctx.organizationId, { _id: new Types.ObjectId(existingId) }),
            { $set: update },
          );
          updated++;
          seenInFile.add(phoneNormalized);
          continue;
        }
        // CREATE_ANYWAY falls through — but the unique index would reject it,
        // so treat it as a skip rather than throwing on every row.
        skipped++;
        errors.push({ row: rowNumber, field: 'phone', value: phoneRaw, reason: 'Already exists in the CRM' });
        continue;
      }

      const seq = await nextSequence(ctx.organizationId, 'lead');

      const source = coerceSource(getValue(row, mapping, 'source') ?? (options.defaults?.source as string));
      const stage = coerceStage(getValue(row, mapping, 'stage') ?? (options.defaults?.stage as string));
      const createdAt = coerceDate(getValue(row, mapping, 'createdAt'));

      const doc: Record<string, unknown> = {
        organizationId: new Types.ObjectId(ctx.organizationId),
        leadCode: formatCode(ctx.leadCodePrefix, seq),
        name: name ? toTitleCase(name) : 'Unnamed lead',
        phone: phoneRaw,
        phoneNormalized,
        altPhone: getValue(row, mapping, 'altPhone'),
        email: normalizeEmail(getValue(row, mapping, 'email')) || undefined,
        address: {
          line1: getValue(row, mapping, 'address.line1'),
          area: getValue(row, mapping, 'address.area') ?? (options.defaults?.city as string | undefined),
          city: getValue(row, mapping, 'address.city') ?? (options.defaults?.city as string | undefined),
          pincode: getValue(row, mapping, 'address.pincode'),
        },
        source,
        sourceDetail:
          getValue(row, mapping, 'sourceDetail') ?? (options.defaults?.sourceDetail as string | undefined),
        campaignName: options.defaults?.campaignName as string | undefined,
        stage,
        requirementNotes: getValue(row, mapping, 'requirementNotes'),
        budgetMin: coerceNumber(getValue(row, mapping, 'budgetMin')),
        budgetMax: coerceNumber(getValue(row, mapping, 'budgetMax')),
        approxAreaSqft: coerceNumber(getValue(row, mapping, 'approxAreaSqft')),
        unitCount: coerceNumber(getValue(row, mapping, 'unitCount')),
        materials: coerceEnumList(getValue(row, mapping, 'materials'), MATERIALS),
        productTypes: coerceEnumList(getValue(row, mapping, 'productTypes'), PRODUCT_TYPES),
        importBatchId: batch._id,
        createdBy: new Types.ObjectId(ctx.userId),
        updatedBy: new Types.ObjectId(ctx.userId),
      };

      if (defaultAssignee) {
        doc.assignedTo = new Types.ObjectId(defaultAssignee);
        doc.assignedToName = defaultAssigneeName;
        doc.assignedAt = new Date();
      }

      // Preserve the original enquiry date where the sheet has one, so the
      // trend chart reflects when leads actually arrived.
      if (createdAt && createdAt <= new Date()) doc.createdAt = createdAt;

      // insertMany bypasses the pre-save hook, so score explicitly.
      const scored = computeLeadScore(doc as never);
      doc.score = scored.score;
      doc.priority = scored.priority;

      await Lead.collection.insertOne({
        ...doc,
        isDeleted: false,
        contactAttempts: 0,
        activityCount: 0,
        quotationCount: 0,
        tags: [],
        competitorNames: [],
        glassTypes: [],
        whatsappSameAsPhone: true,
        scoreLocked: false,
        createdAt: (doc.createdAt as Date) ?? new Date(),
        updatedAt: new Date(),
      } as never);

      existingPhones.set(phoneNormalized, 'new');
      seenInFile.add(phoneNormalized);
      inserted++;
    } catch (err) {
      failed++;
      errors.push({
        row: rowNumber,
        reason: err instanceof Error ? err.message.slice(0, 200) : 'Unexpected error',
      });
    }
  }

  // Cap the stored errors so one catastrophic file cannot bloat the document.
  const storedErrors = errors.slice(0, 200);

  await ImportBatch.updateOne(
    { _id: batch._id },
    {
      $set: {
        inserted,
        updated,
        skipped,
        failed,
        rowErrors: storedErrors,
        status: 'COMPLETED',
        finishedAt: new Date(),
      },
    },
  );

  return {
    batchId: String(batch._id),
    totalRows: rows.length,
    inserted,
    updated,
    skipped,
    failed,
    errors: storedErrors,
  };
}

/** Undo an import by soft-deleting every lead it created. */
export async function rollbackImport(ctx: ImportContext, batchId: string): Promise<number> {
  const result = await Lead.updateMany(
    scoped(ctx.organizationId, { importBatchId: new Types.ObjectId(batchId) }),
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: new Types.ObjectId(ctx.userId),
      },
    },
  );

  await ImportBatch.updateOne(
    scoped(ctx.organizationId, { _id: new Types.ObjectId(batchId) }),
    { $set: { isRolledBack: true, rolledBackAt: new Date() } },
  );

  return result.modifiedCount;
}

/** The canonical column list offered as a downloadable template. */
export const IMPORT_TEMPLATE_HEADERS = [
  'Name',
  'Phone',
  'Alternate Phone',
  'Email',
  'City',
  'Area',
  'Address',
  'Pincode',
  'Source',
  'Campaign',
  'Requirement',
  'Budget',
  'Area Sqft',
  'Units',
  'Created Date',
];
