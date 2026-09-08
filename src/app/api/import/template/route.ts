import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { IMPORT_TEMPLATE_HEADERS } from '@/lib/services/importService';
import { toCsv } from '@/lib/services/exportService';
import { handleApiError } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A blank CSV with the expected headers plus one example row. */
export async function GET() {
  try {
    const user = await requireOrgUser();
    if (!user.can('lead:import')) throw new ForbiddenError();

    const example = [
      'Ramesh Kumar',
      '9876543210',
      '',
      'ramesh@example.com',
      'Hyderabad',
      'Gachibowli',
      'Plot 42, Green Valley',
      '500032',
      'Meta Ads',
      'Monsoon Offer',
      '3 track sliding windows for the front elevation',
      '250000',
      '450',
      '12',
      '01/09/2026',
    ];

    const csv = toCsv(IMPORT_TEMPLATE_HEADERS, [example]);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="lead-import-template.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
