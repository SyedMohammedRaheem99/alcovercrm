import { NextRequest } from 'next/server';
import Papa from 'papaparse';
import { connectDB } from '@/lib/db/connect';
import { ImportBatch } from '@/lib/models';
import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { scoped } from '@/lib/db/repository';
import {
  autoDetectMapping,
  runImport,
  type ParsedRow,
} from '@/lib/services/importService';
import { importConfigSchema } from '@/lib/validation/settings';
import { ok, fail, handleApiError, ValidationError } from '@/lib/api/response';
import { writeAudit, auditContextFrom } from '@/lib/services/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Vercel's request body limit is 4.5MB; stay under it with a clear error. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 5000;

async function parseFile(file: File): Promise<{ rows: ParsedRow[]; headers: string[] }> {
  const name = file.name.toLowerCase();
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');

  if (isExcel) {
    // Lazy import keeps exceljs out of the cold-start path for other routes.
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ValidationError('That spreadsheet has no sheets');

    const headers: string[] = [];
    const rows: ParsedRow[] = [];

    sheet.getRow(1).eachCell((cell, col) => {
      headers[col - 1] = String(cell.value ?? '').trim();
    });

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: ParsedRow = {};
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const header = headers[col - 1];
        if (!header) return;
        const value = cell.value;
        // Excel cells can be rich text or formula objects, not just scalars.
        if (value !== null && typeof value === 'object') {
          if ('text' in value) record[header] = String((value as { text: unknown }).text);
          else if ('result' in value) record[header] = String((value as { result: unknown }).result ?? '');
          else if (value instanceof Date) record[header] = value.toISOString();
          else record[header] = '';
        } else {
          record[header] = value as string | number | null;
        }
      });
      rows.push(record);
    });

    return { rows, headers: headers.filter(Boolean) };
  }

  // CSV
  const text = await file.text();
  const parsed = Papa.parse<ParsedRow>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new ValidationError(`Could not read that file: ${parsed.errors[0]?.message}`);
  }

  return { rows: parsed.data, headers: parsed.meta.fields ?? [] };
}

/**
 * POST /api/import
 *
 * Two modes:
 *  - `?preview=true` parses the file and returns headers, a detected column
 *    mapping and the first rows, so the user can confirm before committing.
 *  - otherwise it runs the import.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireOrgUser();
    if (!user.can('lead:import')) throw new ForbiddenError('You do not have permission to import leads');

    await connectDB();

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) return fail('Choose a CSV or Excel file to upload', 400);
    if (file.size === 0) return fail('That file is empty', 400);
    if (file.size > MAX_FILE_BYTES) {
      return fail('That file is larger than 4MB. Split it into smaller files and import them one at a time.', 413);
    }

    const name = file.name.toLowerCase();
    if (!/\.(csv|xlsx|xls)$/.test(name)) {
      return fail('Only CSV and Excel (.xlsx) files are supported', 400);
    }

    const { rows, headers } = await parseFile(file);

    if (rows.length === 0) return fail('That file has no data rows', 400);
    if (rows.length > MAX_ROWS) {
      return fail(`That file has ${rows.length} rows. Import at most ${MAX_ROWS} at a time.`, 413);
    }

    const isPreview = req.nextUrl.searchParams.get('preview') === 'true';

    if (isPreview) {
      return ok({
        headers,
        detectedMapping: autoDetectMapping(headers),
        totalRows: rows.length,
        sample: rows.slice(0, 5),
      });
    }

    const configRaw = formData.get('config');
    const config = importConfigSchema.parse(
      typeof configRaw === 'string' ? JSON.parse(configRaw) : { mapping: autoDetectMapping(headers) },
    );

    const result = await runImport(
      {
        organizationId: user.organizationId!,
        userId: user.id,
        userName: user.name,
        leadCodePrefix: user.orgSettings.leadCodePrefix || 'LD',
      },
      rows,
      config.mapping,
      {
        duplicateStrategy: config.duplicateStrategy,
        defaults: config.defaults,
        fileName: file.name,
        fileType: name.endsWith('.csv') ? 'csv' : 'xlsx',
      },
    );

    await writeAudit({
      ...auditContextFrom(req.headers, user),
      action: 'IMPORT',
      entityType: 'Lead',
      entityLabel: file.name,
      meta: {
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
      },
    });

    return ok(result);
  } catch (err) {
    return handleApiError(err);
  }
}

/** GET /api/import — history of previous imports. */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireOrgUser();
    if (!user.can('lead:import')) throw new ForbiddenError();

    await connectDB();

    const batches = await ImportBatch.find(scoped(user.organizationId!, {}, { includeDeleted: true }))
      .sort({ createdAt: -1 })
      .limit(25)
      .lean();

    return ok(batches);
  } catch (err) {
    return handleApiError(err);
  }
}
