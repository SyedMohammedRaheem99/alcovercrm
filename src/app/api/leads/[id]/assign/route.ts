import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db/connect';
import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { assignLead } from '@/lib/services/leadService';
import { toObjectId } from '@/lib/db/repository';
import { objectIdSchema } from '@/lib/validation/common';
import { ok, fail, handleApiError } from '@/lib/api/response';
import { writeAudit, auditContextFrom } from '@/lib/services/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** `null` un-assigns the lead and sends it back to the unassigned queue. */
const schema = z.object({ assignedTo: objectIdSchema.nullable() }).strict();

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireOrgUser();
    if (!user.can('lead:assign')) throw new ForbiddenError();

    const { id } = await params;
    if (!toObjectId(id)) return fail('Invalid lead id', 400);

    await connectDB();
    const { assignedTo } = schema.parse(await req.json().catch(() => ({})));

    const lead = await assignLead(
      {
        organizationId: user.organizationId!,
        userId: user.id,
        userName: user.name,
        leadCodePrefix: user.orgSettings.leadCodePrefix || 'LD',
      },
      id,
      assignedTo,
    );

    await writeAudit({
      ...auditContextFrom(req.headers, user),
      action: 'UPDATE',
      entityType: 'Lead',
      entityId: lead._id,
      entityLabel: `${lead.leadCode} · ${lead.name}`,
      meta: { assignedTo: lead.assignedToName ?? 'Unassigned' },
    });

    return ok(lead.toJSON());
  } catch (err) {
    return handleApiError(err);
  }
}
