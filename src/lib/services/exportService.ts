import { Lead, Activity, Quotation, User, Master, Organization, ImportBatch } from '@/lib/models';
import { scoped, type QueryFilter } from '@/lib/db/repository';
import { csvSafe } from '@/lib/utils/sanitize';
import { formatPhoneDisplay } from '@/lib/utils/phone';
import {
  STAGE_LABELS,
  PRIORITY_LABELS,
  SOURCE_LABELS,
  MATERIAL_LABELS,
  PRODUCT_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  CONSTRUCTION_STAGE_LABELS,
  TIMELINE_LABELS,
  LOST_REASON_LABELS,
} from '@/lib/constants/enums';

/**
 * Export and backup.
 *
 * Two distinct jobs:
 *  - EXPORT: a readable spreadsheet for the owner, with codes translated to
 *    labels ("Site Visit Done", not "SITE_VISIT_DONE").
 *  - BACKUP: a complete, faithful JSON dump of every collection, meant to be
 *    restorable. It keeps raw values and ids.
 */

/* ------------------------------------------------------------------ *
 * CSV generation
 * ------------------------------------------------------------------ */

/**
 * Quote a CSV cell.
 *
 * `csvSafe` first neutralises formula injection: a lead named `=cmd|'/c calc'`
 * would otherwise execute when the client opens the file in Excel.
 */
function csvCell(value: unknown): string {
  const safe = csvSafe(value ?? '');
  if (safe === '') return '';
  const needsQuotes = /[",\n\r]/.test(safe);
  return needsQuotes ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  // A UTF-8 BOM makes Excel render Indian names and the rupee sign correctly
  // instead of mojibake.
  return '﻿' + lines.join('\r\n');
}

/* ------------------------------------------------------------------ *
 * Lead export (human-readable)
 * ------------------------------------------------------------------ */

export const LEAD_EXPORT_HEADERS = [
  'Lead Code',
  'Name',
  'Phone',
  'Alternate Phone',
  'Email',
  'Stage',
  'Priority',
  'Score',
  'Source',
  'Campaign',
  'Area',
  'City',
  'Pincode',
  'Address',
  'Materials',
  'Products',
  'Property Type',
  'Construction Stage',
  'Timeline',
  'Budget Min',
  'Budget Max',
  'Area (sq.ft)',
  'Units',
  'Requirement',
  'Assigned To',
  'Contact Attempts',
  'First Contacted',
  'Last Contacted',
  'Next Follow-up',
  'Follow-up Note',
  'Deal Value',
  'Lost Reason',
  'Tags',
  'Created On',
];

function labelList(values: string[] | undefined, labels: Record<string, string>): string {
  if (!values?.length) return '';
  return values.map((v) => labels[v] ?? v).join(', ');
}

function isoDate(d?: Date | null): string {
  if (!d) return '';
  // `YYYY-MM-DD HH:mm` sorts correctly as text in a spreadsheet, unlike
  // a localised format.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function exportLeadsToRows(
  organizationId: string,
  filter: QueryFilter,
  limit = 20000,
): Promise<unknown[][]> {
  const leads = await Lead.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

  return leads.map((l) => [
    l.leadCode,
    l.name,
    formatPhoneDisplay(l.phone),
    l.altPhone ? formatPhoneDisplay(l.altPhone) : '',
    l.email ?? '',
    STAGE_LABELS[l.stage] ?? l.stage,
    PRIORITY_LABELS[l.priority] ?? l.priority,
    l.score ?? '',
    SOURCE_LABELS[l.source] ?? l.source,
    l.sourceDetail ?? l.campaignName ?? '',
    l.address?.area ?? '',
    l.address?.city ?? '',
    l.address?.pincode ?? '',
    l.address?.line1 ?? '',
    labelList(l.materials, MATERIAL_LABELS),
    labelList(l.productTypes, PRODUCT_TYPE_LABELS),
    l.propertyType ? (PROPERTY_TYPE_LABELS[l.propertyType] ?? l.propertyType) : '',
    l.constructionStage ? (CONSTRUCTION_STAGE_LABELS[l.constructionStage] ?? l.constructionStage) : '',
    l.timeline ? (TIMELINE_LABELS[l.timeline] ?? l.timeline) : '',
    l.budgetMin ?? '',
    l.budgetMax ?? '',
    l.approxAreaSqft ?? '',
    l.unitCount ?? '',
    l.requirementNotes ?? '',
    l.assignedToName ?? '',
    l.contactAttempts ?? 0,
    isoDate(l.firstContactedAt),
    isoDate(l.lastContactedAt),
    isoDate(l.nextFollowUpAt),
    l.nextFollowUpNote ?? '',
    l.dealValue ?? '',
    l.lostReason ? (LOST_REASON_LABELS[l.lostReason] ?? l.lostReason) : '',
    (l.tags ?? []).join(', '),
    isoDate(l.createdAt),
  ]);
}

export async function exportLeadsCsv(organizationId: string, filter: QueryFilter): Promise<string> {
  const rows = await exportLeadsToRows(organizationId, filter);
  return toCsv(LEAD_EXPORT_HEADERS, rows);
}

/* ------------------------------------------------------------------ *
 * Excel export
 * ------------------------------------------------------------------ */

export async function exportLeadsXlsx(organizationId: string, filter: QueryFilter): Promise<Buffer> {
  // Imported lazily so the ~1MB exceljs bundle is not pulled into every
  // serverless function that imports this module.
  const ExcelJS = (await import('exceljs')).default;

  const rows = await exportLeadsToRows(organizationId, filter);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Alcove CRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Leads', {
    views: [{ state: 'frozen', ySplit: 1 }], // header stays visible while scrolling
  });

  sheet.addRow(LEAD_EXPORT_HEADERS);
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  header.height = 20;
  header.alignment = { vertical: 'middle' };

  for (const row of rows) sheet.addRow(row);

  // Rough auto-fit: sample the first 100 rows so a huge export stays fast.
  sheet.columns.forEach((column, i) => {
    const sample = rows.slice(0, 100).map((r) => String(r[i] ?? '').length);
    const longest = Math.max(LEAD_EXPORT_HEADERS[i]?.length ?? 10, ...sample, 8);
    column.width = Math.min(42, longest + 2);
  });

  sheet.autoFilter = { from: 'A1', to: { row: 1, column: LEAD_EXPORT_HEADERS.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/* ------------------------------------------------------------------ *
 * Full backup
 * ------------------------------------------------------------------ */

export interface BackupPayload {
  meta: {
    generatedAt: string;
    organizationId: string;
    organizationName: string;
    version: string;
    counts: Record<string, number>;
  };
  organization: unknown;
  users: unknown[];
  leads: unknown[];
  activities: unknown[];
  quotations: unknown[];
  masters: unknown[];
  importBatches: unknown[];
}

/**
 * Complete tenant backup.
 *
 * Includes soft-deleted rows on purpose — a backup that silently drops deleted
 * records is not a backup. User password hashes are excluded: they are not
 * needed to restore business data and should never sit in a file on someone's
 * laptop.
 */
export async function buildBackup(organizationId: string): Promise<BackupPayload> {
  const all = { includeDeleted: true };

  const [org, users, leads, activities, quotations, masters, importBatches] = await Promise.all([
    Organization.findById(organizationId).lean(),
    User.find({ organizationId }).select('-passwordHash').lean(),
    Lead.find(scoped(organizationId, {}, all)).lean(),
    Activity.find(scoped(organizationId, {}, all)).lean(),
    Quotation.find(scoped(organizationId, {}, all)).lean(),
    Master.find({ organizationId }).lean(),
    ImportBatch.find({ organizationId }).lean(),
  ]);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      organizationId,
      organizationName: org?.name ?? 'Unknown',
      version: '1.0',
      counts: {
        users: users.length,
        leads: leads.length,
        activities: activities.length,
        quotations: quotations.length,
        masters: masters.length,
        importBatches: importBatches.length,
      },
    },
    organization: org,
    users,
    leads,
    activities,
    quotations,
    masters,
    importBatches,
  };
}

/** Build a multi-sheet Excel workbook containing the whole tenant. */
export async function buildBackupWorkbook(organizationId: string): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const backup = await buildBackup(organizationId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Alcove CRM';
  workbook.created = new Date();

  // Leads sheet uses the readable export shape.
  const leadRows = await exportLeadsToRows(organizationId, scoped(organizationId, {}, { includeDeleted: true }));
  const leadSheet = workbook.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] });
  leadSheet.addRow(LEAD_EXPORT_HEADERS);
  leadSheet.getRow(1).font = { bold: true };
  leadRows.forEach((r) => leadSheet.addRow(r));
  leadSheet.columns.forEach((c, i) => {
    c.width = Math.min(40, Math.max(12, (LEAD_EXPORT_HEADERS[i]?.length ?? 12) + 2));
  });

  // Activities
  const actSheet = workbook.addWorksheet('Activities');
  actSheet.addRow(['Date', 'Lead', 'Type', 'Outcome', 'Subject', 'Notes', 'By']);
  actSheet.getRow(1).font = { bold: true };
  const leadCodeById = new Map(
    (backup.leads as Array<{ _id: unknown; leadCode: string }>).map((l) => [String(l._id), l.leadCode]),
  );
  for (const a of backup.activities as Array<Record<string, unknown>>) {
    actSheet.addRow([
      isoDate(a.createdAt as Date),
      leadCodeById.get(String(a.leadId)) ?? '',
      a.type ?? '',
      a.outcome ?? '',
      a.subject ?? '',
      a.body ?? '',
      a.performedByName ?? '',
    ]);
  }
  actSheet.columns.forEach((c) => (c.width = 20));

  // Team
  const userSheet = workbook.addWorksheet('Team');
  userSheet.addRow(['Name', 'Email', 'Phone', 'Role', 'Active', 'Last Login']);
  userSheet.getRow(1).font = { bold: true };
  for (const u of backup.users as Array<Record<string, unknown>>) {
    userSheet.addRow([
      u.name ?? '',
      u.email ?? '',
      u.phone ?? '',
      u.role ?? '',
      u.isActive ? 'Yes' : 'No',
      isoDate(u.lastLoginAt as Date),
    ]);
  }
  userSheet.columns.forEach((c) => (c.width = 22));

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Filename-safe timestamp, e.g. `2026-09-08_1430`. */
export function backupTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
