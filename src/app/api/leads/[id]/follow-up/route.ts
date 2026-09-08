import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/connect';
import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { rescheduleFollowUpSchema } from '@/lib/validation/activity';
import { rescheduleFollowUp } from '@/lib/services/leadService';
import { toObjectId } from '@/lib/db/repository';
import { ok, fail, handleApiError } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** POST — snooze or reschedule the next follow-up from the dashboard. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireOrgUser();
    if (!user.can('lead:edit')) throw new ForbiddenError();

    const { id } = await params;
    if (!toObjectId(id)) return fail('Invalid lead id', 400);

    await connectDB();
    const input = rescheduleFollowUpSchema.parse(await req.json().catch(() => ({})));

    const lead = await rescheduleFollowUp(
      {
        organizationId: user.organizationId!,
        userId: user.id,
        userName: user.name,
        leadCodePrefix: user.orgSettings.leadCodePrefix || 'LD',
      },
      id,
      input.nextFollowUpAt,
      input.nextFollowUpNote,
      input.reason,
    );

    return ok(lead.toJSON());
  } catch (err) {
    return handleApiError(err);
  }
}
