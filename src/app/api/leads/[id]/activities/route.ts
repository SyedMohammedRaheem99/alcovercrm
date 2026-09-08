import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/connect';
import { Activity, Lead } from '@/lib/models';
import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { logActivitySchema } from '@/lib/validation/activity';
import { logActivity } from '@/lib/services/leadService';
import { scoped, toObjectId } from '@/lib/db/repository';
import { ok, created, fail, handleApiError, NotFoundError } from '@/lib/api/response';
import type { ActivityType, CallOutcome } from '@/lib/constants/enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET — the lead timeline. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireOrgUser();
    const { id } = await params;
    const leadId = toObjectId(id);
    if (!leadId) return fail('Invalid lead id', 400);

    await connectDB();
    const activities = await Activity.find(scoped(user.organizationId!, { leadId }))
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return ok(activities);
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST — log a call, WhatsApp message, note or site visit.
 *
 * This is the most-used write endpoint in the product. The discipline rule
 * (a next follow-up, or an explicit closure) is enforced inside `logActivity`
 * rather than here, so every caller gets the same behaviour.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireOrgUser();
    if (!user.can('activity:create')) throw new ForbiddenError();

    const { id } = await params;
    const leadId = toObjectId(id);
    if (!leadId) return fail('Invalid lead id', 400);

    await connectDB();

    const lead = await Lead.findOne(scoped(user.organizationId!, { _id: leadId }))
      .select('assignedTo')
      .lean();
    if (!lead) throw new NotFoundError('Lead not found');
    if (!user.seesAllLeads && String(lead.assignedTo ?? '') !== user.id) {
      throw new ForbiddenError('This lead is assigned to someone else');
    }

    const body = await req.json().catch(() => ({}));
    const input = logActivitySchema.parse(body);

    const result = await logActivity(
      {
        organizationId: user.organizationId!,
        userId: user.id,
        userName: user.name,
        leadCodePrefix: user.orgSettings.leadCodePrefix || 'LD',
      },
      id,
      {
        ...input,
        type: input.type as ActivityType,
        outcome: input.outcome as CallOutcome | undefined,
      },
      user.orgSettings.requireNextActionOnCall ?? true,
    );

    return created({ activityId: result.activityId, lead: result.lead.toJSON() });
  } catch (err) {
    return handleApiError(err);
  }
}
