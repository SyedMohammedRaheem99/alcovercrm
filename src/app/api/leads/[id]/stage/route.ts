import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/connect';
import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { stageChangeSchema } from '@/lib/validation/lead';
import { changeStage } from '@/lib/services/leadService';
import { toObjectId } from '@/lib/db/repository';
import { ok, fail, handleApiError } from '@/lib/api/response';
import { writeAudit, auditContextFrom } from '@/lib/services/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** POST — move a lead along the pipeline (used by the board and detail header). */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireOrgUser();
    if (!user.can('lead:edit')) throw new ForbiddenError();

    const { id } = await params;
    if (!toObjectId(id)) return fail('Invalid lead id', 400);

    await connectDB();

    const body = await req.json().catch(() => ({}));
    const input = stageChangeSchema.parse(body);

    const lead = await changeStage(
      {
        organizationId: user.organizationId!,
        userId: user.id,
        userName: user.name,
        leadCodePrefix: user.orgSettings.leadCodePrefix || 'LD',
      },
      id,
      input,
      user.orgSettings.requireNextActionOnCall,
    );

    await writeAudit({
      ...auditContextFrom(req.headers, user),
      action: 'UPDATE',
      entityType: 'Lead',
      entityId: lead._id,
      entityLabel: `${lead.leadCode} · ${lead.name}`,
      meta: { stage: input.stage },
    });

    return ok(lead.toJSON());
  } catch (err) {
    return handleApiError(err);
  }
}
