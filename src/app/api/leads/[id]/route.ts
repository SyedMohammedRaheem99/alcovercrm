import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db/connect';
import { Lead, Activity, Quotation } from '@/lib/models';
import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { leadUpdateSchema } from '@/lib/validation/lead';
import { scoped, toObjectId, pickAllowed, LEAD_WRITABLE_FIELDS } from '@/lib/db/repository';
import { softDeleteLead, restoreLead } from '@/lib/services/leadService';
import { computeLeadScore } from '@/lib/services/leadScore';
import { ok, fail, handleApiError, NotFoundError } from '@/lib/api/response';
import { writeAudit, auditContextFrom, diffChanges } from '@/lib/services/audit';
import { User } from '@/lib/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/leads/:id — full detail plus timeline and quotations. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireOrgUser();
    const { id } = await params;
    const leadId = toObjectId(id);
    if (!leadId) return fail('Invalid lead id', 400);

    await connectDB();

    const lead = await Lead.findOne(
      scoped(user.organizationId!, { _id: leadId }, { includeDeleted: true }),
    ).lean();
    if (!lead) throw new NotFoundError('Lead not found');

    // A SALES user may only open leads assigned to them.
    if (!user.seesAllLeads && String(lead.assignedTo ?? '') !== user.id) {
      throw new ForbiddenError('This lead is assigned to someone else');
    }

    const [activities, quotations] = await Promise.all([
      Activity.find(scoped(user.organizationId!, { leadId }))
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      Quotation.find(scoped(user.organizationId!, { leadId })).sort({ createdAt: -1 }).lean(),
    ]);

    const score = computeLeadScore(lead);

    return ok({ lead, activities, quotations, scoreFactors: score.factors });
  } catch (err) {
    return handleApiError(err);
  }
}

/** PATCH /api/leads/:id — partial update. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireOrgUser();
    if (!user.can('lead:edit')) throw new ForbiddenError();

    const { id } = await params;
    const leadId = toObjectId(id);
    if (!leadId) return fail('Invalid lead id', 400);

    await connectDB();

    const lead = await Lead.findOne(scoped(user.organizationId!, { _id: leadId }));
    if (!lead) throw new NotFoundError('Lead not found');

    if (!user.seesAllLeads && String(lead.assignedTo ?? '') !== user.id) {
      throw new ForbiddenError('This lead is assigned to someone else');
    }

    const body = await req.json().catch(() => ({}));
    const parsed = leadUpdateSchema.parse(body);
    const safe = pickAllowed(parsed as Record<string, unknown>, [...LEAD_WRITABLE_FIELDS, 'address']);

    const before = lead.toObject();

    // Reassignment must refresh the denormalised name.
    if ('assignedTo' in safe) {
      if (safe.assignedTo) {
        const assignee = await User.findOne({
          _id: safe.assignedTo as string,
          organizationId: user.organizationId,
          isDeleted: false,
        })
          .select('name')
          .lean();
        if (!assignee) throw new NotFoundError('The selected team member was not found');
        lead.assignedToName = assignee.name;
        lead.assignedAt = new Date();
      } else {
        lead.assignedToName = undefined;
        lead.assignedAt = undefined;
      }
    }

    Object.assign(lead, safe);

    // A manual priority choice pins the score so auto-scoring stops overriding it.
    if (parsed.priority && !parsed.scoreLocked) lead.scoreLocked = true;

    lead.updatedBy = new Types.ObjectId(user.id);
    await lead.save();

    const changes = diffChanges(
      before as unknown as Record<string, unknown>,
      lead.toObject() as unknown as Record<string, unknown>,
      Object.keys(safe),
    );

    if (Object.keys(changes).length > 0) {
      await writeAudit({
        ...auditContextFrom(req.headers, user),
        action: 'UPDATE',
        entityType: 'Lead',
        entityId: lead._id,
        entityLabel: `${lead.leadCode} · ${lead.name}`,
        changes,
      });
    }

    return ok(lead.toJSON());
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/leads/:id — soft delete (never destroys customer data). */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireOrgUser();
    if (!user.can('lead:delete')) throw new ForbiddenError();

    const { id } = await params;
    const leadId = toObjectId(id);
    if (!leadId) return fail('Invalid lead id', 400);

    await connectDB();

    const lead = await Lead.findOne(scoped(user.organizationId!, { _id: leadId })).select('leadCode name').lean();
    if (!lead) throw new NotFoundError('Lead not found');

    const ctx = {
      organizationId: user.organizationId!,
      userId: user.id,
      userName: user.name,
      leadCodePrefix: user.orgSettings.leadCodePrefix || 'LD',
    };

    const restore = req.nextUrl.searchParams.get('restore') === 'true';
    if (restore) {
      if (!user.can('lead:restore')) throw new ForbiddenError();
      await restoreLead(ctx, id);
    } else {
      await softDeleteLead(ctx, id);
    }

    await writeAudit({
      ...auditContextFrom(req.headers, user),
      action: restore ? 'RESTORE' : 'DELETE',
      entityType: 'Lead',
      entityId: leadId,
      entityLabel: `${lead.leadCode} · ${lead.name}`,
    });

    return ok({ deleted: !restore, restored: restore });
  } catch (err) {
    return handleApiError(err);
  }
}
