import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/connect';
import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { leadQuerySchema } from '@/lib/validation/lead';
import { buildLeadFilter } from '@/lib/services/leadQuery';
import { exportLeadsCsv, exportLeadsXlsx, backupTimestamp } from '@/lib/services/exportService';
import { handleApiError } from '@/lib/api/response';
import { writeAudit, auditContextFrom } from '@/lib/services/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/export?format=csv|xlsx&<same filters as the list view>
 *
 * The filters are parsed with the SAME schema as the list endpoint, so
 * "export what I am looking at" really does export what is on screen.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireOrgUser();
    if (!user.can('lead:export')) throw new ForbiddenError('You do not have permission to export data');

    await connectDB();

    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const format = params.format === 'xlsx' ? 'xlsx' : 'csv';
    delete params.format;

    // Export ignores pagination: the user wants every matching row.
    const query = leadQuerySchema.parse({ ...params, page: 1, limit: 200 });
    const filter = buildLeadFilter(
      {
        organizationId: user.organizationId!,
        userId: user.id,
        seesAllLeads: user.seesAllLeads,
        timezone: user.orgTimezone,
        slaMinutes: user.orgSettings.leadResponseSlaMinutes ?? 30,
      },
      query,
    );

    const stamp = backupTimestamp();

    await writeAudit({
      ...auditContextFrom(req.headers, user),
      action: 'EXPORT',
      entityType: 'Lead',
      meta: { format, filters: params },
    });

    if (format === 'xlsx') {
      const buffer = await exportLeadsXlsx(user.organizationId!, filter);
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="leads_${stamp}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const csv = await exportLeadsCsv(user.organizationId!, filter);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads_${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
