import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/connect';
import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { buildBackup, buildBackupWorkbook, backupTimestamp } from '@/lib/services/exportService';
import { handleApiError } from '@/lib/api/response';
import { writeAudit, auditContextFrom } from '@/lib/services/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A full backup of a large tenant takes longer than the default 15s budget.
export const maxDuration = 60;

/**
 * GET /api/backup?format=json|xlsx
 *
 * The client asked for a downloadable backup they can keep weekly/monthly.
 * JSON is the faithful, restorable copy; XLSX is the one a human can open.
 *
 * Admin-only, and every download is recorded in the audit log — this endpoint
 * hands over the entire customer database in one request.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireOrgUser();
    if (!user.can('backup:run')) throw new ForbiddenError('Only an administrator can download backups');

    await connectDB();

    const format = req.nextUrl.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'json';
    const stamp = backupTimestamp();
    const orgSlug = user.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);

    await writeAudit({
      ...auditContextFrom(req.headers, user),
      action: 'BACKUP',
      meta: { format },
    });

    if (format === 'xlsx') {
      const buffer = await buildBackupWorkbook(user.organizationId!);
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${orgSlug}_backup_${stamp}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const backup = await buildBackup(user.organizationId!);

    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${orgSlug}_backup_${stamp}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
