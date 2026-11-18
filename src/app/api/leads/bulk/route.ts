import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db/connect';
import { Lead, User, Activity } from '@/lib/models';
import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { bulkActionSchema } from '@/lib/validation/lead';
import { scoped } from '@/lib/db/repository';
import { ok, fail, handleApiError, NotFoundError } from '@/lib/api/response';
import { writeAudit, auditContextFrom } from '@/lib/services/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/bulk — apply one action to many leads.
 *
 * Every branch scopes by organisation, so a forged id from another tenant
 * simply does not match and is silently ignored rather than modified.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireOrgUser();
    if (!user.can('lead:bulk_edit')) throw new ForbiddenError();

    await connectDB();

    const input = bulkActionSchema.parse(await req.json().catch(() => ({})));
    const ids = input.leadIds.map((id) => new Types.ObjectId(id));

    const filter = scoped(
      user.organizationId!,
      { _id: { $in: ids } },
      { includeDeleted: input.action === 'RESTORE' },
    );

    const now = new Date();
    const actorId = new Types.ObjectId(user.id);
    let update: Record<string, unknown> = {};
    let auditMeta: Record<string, unknown> = { count: ids.length, action: input.action };

    switch (input.action) {
      case 'ASSIGN': {
        const assignee = await User.findOne({
          _id: input.assignedTo,
          organizationId: user.organizationId,
          isDeleted: false,
          isActive: true,
        })
          .select('name')
          .lean();
        if (!assignee) throw new NotFoundError('The selected team member was not found');

        update = {
          $set: {
            assignedTo: new Types.ObjectId(input.assignedTo!),
            assignedToName: assignee.name,
            assignedAt: now,
            updatedBy: actorId,
          },
        };
        auditMeta = { ...auditMeta, assignedTo: assignee.name };
        break;
      }

      case 'STAGE': {
        // Mirror the single-lead rule: a lost lead always carries a reason,
        // otherwise the lost-reason report silently drops rows.
        if (input.stage === 'LOST' && !input.lostReason) {
          return fail('Select a reason when marking leads as lost', 400);
        }

        const set: Record<string, unknown> = { stage: input.stage, updatedBy: actorId };
        const unset: Record<string, string> = {};

        // Mirror the model hook: a closed lead carries no pending follow-up.
        if (input.stage === 'WON') {
          set.wonAt = now;
          set.customerSince = now;
          unset.nextFollowUpAt = '';
          unset.nextFollowUpNote = '';
          unset.lostAt = '';
        } else if (input.stage === 'LOST') {
          set.lostAt = now;
          set.lostReason = input.lostReason;
          unset.nextFollowUpAt = '';
          unset.nextFollowUpNote = '';
          unset.wonAt = '';
        }

        update = Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set };
        auditMeta = { ...auditMeta, stage: input.stage };

        // Moving a lead off NEW means someone engaged with it. `updateMany`
        // bypasses the model hook, so the contact markers are stamped here in a
        // separate pass restricted to leads that are still NEW and uncontacted.
        if (input.stage !== 'NEW') {
          await Lead.updateMany(
            scoped(user.organizationId!, {
              _id: { $in: ids },
              firstContactedAt: { $exists: false },
            }),
            { $set: { firstContactedAt: now, lastContactedAt: now } },
          );
        }
        break;
      }

      case 'PRIORITY':
        // Setting priority by hand pins it so auto-scoring stops overriding it.
        update = { $set: { priority: input.priority, scoreLocked: true, updatedBy: actorId } };
        auditMeta = { ...auditMeta, priority: input.priority };
        break;

      case 'TAG':
        update = { $addToSet: { tags: input.tag }, $set: { updatedBy: actorId } };
        auditMeta = { ...auditMeta, tag: input.tag };
        break;

      case 'UNTAG':
        update = { $pull: { tags: input.tag }, $set: { updatedBy: actorId } };
        auditMeta = { ...auditMeta, tag: input.tag };
        break;

      case 'DELETE':
        if (!user.can('lead:delete')) throw new ForbiddenError();
        update = { $set: { isDeleted: true, deletedAt: now, deletedBy: actorId } };
        break;

      case 'RESTORE':
        if (!user.can('lead:restore')) throw new ForbiddenError();
        update = { $set: { isDeleted: false }, $unset: { deletedAt: '', deletedBy: '' } };
        break;
    }

    const result = await Lead.updateMany(filter, update);

    // Record the change on each lead's timeline so history stays complete.
    if (['ASSIGN', 'STAGE', 'PRIORITY'].includes(input.action) && result.modifiedCount > 0) {
      const affected = await Lead.find(filter).select('_id').lean();
      await Activity.insertMany(
        affected.map((lead) => ({
          organizationId: new Types.ObjectId(user.organizationId!),
          leadId: lead._id,
          type: input.action === 'ASSIGN' ? 'ASSIGNMENT' : 'STAGE_CHANGE',
          subject: `Bulk ${input.action.toLowerCase()} update`,
          status: 'COMPLETED',
          metadata: auditMeta,
          performedBy: actorId,
          performedByName: user.name,
        })),
        { ordered: false },
      ).catch(() => {
        // Timeline entries are best-effort; never fail the bulk action over them.
      });
    }

    await writeAudit({
      ...auditContextFrom(req.headers, user),
      action: 'BULK_UPDATE',
      entityType: 'Lead',
      meta: { ...auditMeta, modified: result.modifiedCount },
    });

    return ok({
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
