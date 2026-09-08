import { Types } from 'mongoose';
import { Lead, Activity, User, nextSequence, formatCode, type ILead } from '@/lib/models';
import { scoped, type QueryFilter } from '@/lib/db/repository';
import { normalizePhone } from '@/lib/utils/phone';
import { ConflictError, NotFoundError } from '@/lib/api/response';
import type { LeadStage, LostReason, ActivityType, CallOutcome } from '@/lib/constants/enums';
import { CONNECTED_OUTCOMES } from '@/lib/constants/enums';

/**
 * Lead business logic.
 *
 * Anything that must stay consistent across write paths lives here rather than
 * in a route handler: lead-code allocation, duplicate detection, the
 * denormalised counters, and the follow-up discipline rule.
 */

export interface ActorContext {
  organizationId: string;
  userId: string;
  userName: string;
  leadCodePrefix: string;
}

/* ------------------------------------------------------------------ *
 * Duplicate detection
 * ------------------------------------------------------------------ */

export interface DuplicateMatch {
  id: string;
  leadCode: string;
  name: string;
  phone: string;
  stage: LeadStage;
  assignedToName?: string;
  createdAt: Date;
}

/**
 * Find an existing lead with the same phone number.
 *
 * Checks both the primary and alternate number so a customer who gave a second
 * number last month is still recognised.
 */
export async function findDuplicateByPhone(
  organizationId: string,
  phone: string,
  excludeLeadId?: string,
): Promise<DuplicateMatch | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const filter: QueryFilter = {
    $or: [{ phoneNormalized: normalized }, { altPhoneNormalized: normalized }],
  };

  if (excludeLeadId && Types.ObjectId.isValid(excludeLeadId)) {
    filter._id = { $ne: new Types.ObjectId(excludeLeadId) };
  }

  // `scoped` strips `$` keys from caller input, so the operators above are added
  // after scoping rather than passed through it.
  const existing = await Lead.findOne({
    ...scoped(organizationId),
    ...filter,
  })
    .select('leadCode name phone stage assignedToName createdAt')
    .lean();

  if (!existing) return null;

  return {
    id: String(existing._id),
    leadCode: existing.leadCode,
    name: existing.name,
    phone: existing.phone,
    stage: existing.stage,
    assignedToName: existing.assignedToName,
    createdAt: existing.createdAt,
  };
}

/* ------------------------------------------------------------------ *
 * Creation
 * ------------------------------------------------------------------ */

export async function createLead(
  ctx: ActorContext,
  input: Record<string, unknown>,
  options: { allowDuplicate?: boolean; importBatchId?: string } = {},
): Promise<ILead> {
  const phone = String(input.phone ?? '');

  if (!options.allowDuplicate) {
    const duplicate = await findDuplicateByPhone(ctx.organizationId, phone);
    if (duplicate) {
      throw new ConflictError(
        `${duplicate.name} (${duplicate.leadCode}) already exists with this phone number`,
      );
    }
  }

  const seq = await nextSequence(ctx.organizationId, 'lead');

  // Resolve the assignee's name once, so list views never need to populate.
  let assignedToName: string | undefined;
  if (input.assignedTo) {
    const assignee = await User.findOne({
      _id: input.assignedTo,
      organizationId: ctx.organizationId,
      isDeleted: false,
    })
      .select('name')
      .lean();
    if (!assignee) throw new NotFoundError('The selected team member was not found');
    assignedToName = assignee.name;
  }

  const lead = await Lead.create({
    ...input,
    organizationId: new Types.ObjectId(ctx.organizationId),
    leadCode: formatCode(ctx.leadCodePrefix, seq),
    assignedToName,
    assignedAt: input.assignedTo ? new Date() : undefined,
    createdBy: new Types.ObjectId(ctx.userId),
    updatedBy: new Types.ObjectId(ctx.userId),
    importBatchId: options.importBatchId ? new Types.ObjectId(options.importBatchId) : undefined,
  });

  await logSystemActivity(lead, ctx, 'SYSTEM', 'Lead created', {
    source: lead.source,
  });

  if (lead.nextFollowUpAt) {
    await logSystemActivity(lead, ctx, 'FOLLOW_UP_SET', 'Follow-up scheduled', {
      at: lead.nextFollowUpAt.toISOString(),
    });
  }

  return lead;
}

/* ------------------------------------------------------------------ *
 * Activity logging — where the discipline rule is enforced
 * ------------------------------------------------------------------ */

export interface LogActivityOptions {
  type: ActivityType;
  direction?: 'OUTGOING' | 'INCOMING';
  outcome?: CallOutcome;
  durationSeconds?: number;
  subject?: string;
  body?: string;
  scheduledAt?: Date;
  status?: 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  assignedTo?: string;
  location?: Record<string, unknown>;
  nextFollowUpAt?: Date;
  nextFollowUpNote?: string;
  closeLead?: boolean;
  lostReason?: LostReason;
  lostReasonDetail?: string;
  markWon?: boolean;
  dealValue?: number;
}

/**
 * Log an activity against a lead and apply every side effect in one place.
 *
 * The rule: a contact attempt must leave the lead with either a scheduled next
 * action or an explicit closure. Enforced here so the API, the mobile UI and a
 * future bulk tool all behave identically.
 */
export async function logActivity(
  ctx: ActorContext,
  leadId: string,
  opts: LogActivityOptions,
  requireNextAction: boolean,
): Promise<{ lead: ILead; activityId: string }> {
  const lead = await Lead.findOne(scoped(ctx.organizationId, { _id: new Types.ObjectId(leadId) }));
  if (!lead) throw new NotFoundError('Lead not found');

  const isContactAttempt = opts.type === 'CALL' || opts.type === 'WHATSAPP' || opts.type === 'MEETING';
  const isClosing = opts.closeLead || opts.markWon;
  const schedulesFuture = !!opts.nextFollowUpAt || (opts.status === 'PENDING' && !!opts.scheduledAt);

  if (requireNextAction && isContactAttempt && !isClosing && !schedulesFuture) {
    throw new ConflictError(
      'Set the next follow-up, or close this lead with a reason. A lead must never be left without a next step.',
    );
  }

  const now = new Date();

  const activity = await Activity.create({
    organizationId: new Types.ObjectId(ctx.organizationId),
    leadId: lead._id,
    type: opts.type,
    direction: opts.direction,
    outcome: opts.outcome,
    durationSeconds: opts.durationSeconds,
    subject: opts.subject,
    body: opts.body,
    scheduledAt: opts.scheduledAt,
    status: opts.status ?? 'COMPLETED',
    location: opts.location,
    assignedTo: opts.assignedTo ? new Types.ObjectId(opts.assignedTo) : undefined,
    performedBy: new Types.ObjectId(ctx.userId),
    performedByName: ctx.userName,
  });

  /* ---- Contact tracking (powers the speed-to-lead metric) ---- */
  if (isContactAttempt) {
    lead.contactAttempts = (lead.contactAttempts ?? 0) + 1;
    lead.lastContactedAt = now;

    // `firstContactedAt` is only set when we genuinely reached the person —
    // ringing an unanswered phone is not "contacted", and treating it as such
    // would make the response-time report meaningless.
    if (!lead.firstContactedAt && opts.outcome && CONNECTED_OUTCOMES.includes(opts.outcome)) {
      lead.firstContactedAt = now;
    }

    if (lead.stage === 'NEW') lead.stage = 'CONTACTED';
  }

  /* ---- Stage transitions driven by the activity ---- */
  if (opts.type === 'SITE_VISIT') {
    if (opts.status === 'PENDING') lead.stage = 'SITE_VISIT_SCHEDULED';
    else if (opts.status === 'COMPLETED') lead.stage = 'SITE_VISIT_DONE';
  }

  if (opts.type === 'QUOTATION_SENT' && !['WON', 'LOST'].includes(lead.stage)) {
    lead.stage = 'QUOTED';
  }

  /* ---- Closure ---- */
  if (opts.markWon) {
    lead.stage = 'WON';
    if (opts.dealValue !== undefined) lead.dealValue = opts.dealValue;
  } else if (opts.closeLead) {
    lead.stage = 'LOST';
    lead.lostReason = opts.lostReason;
    lead.lostReasonDetail = opts.lostReasonDetail;
  } else if (opts.nextFollowUpAt) {
    lead.nextFollowUpAt = opts.nextFollowUpAt;
    lead.nextFollowUpNote = opts.nextFollowUpNote;
  }

  lead.activityCount = (lead.activityCount ?? 0) + 1;
  lead.updatedBy = new Types.ObjectId(ctx.userId);

  await lead.save();

  if (opts.nextFollowUpAt && !isClosing) {
    await logSystemActivity(lead, ctx, 'FOLLOW_UP_SET', 'Follow-up scheduled', {
      at: opts.nextFollowUpAt.toISOString(),
      note: opts.nextFollowUpNote,
    });
  }

  return { lead, activityId: String(activity._id) };
}

/* ------------------------------------------------------------------ *
 * Stage changes
 * ------------------------------------------------------------------ */

export async function changeStage(
  ctx: ActorContext,
  leadId: string,
  input: {
    stage: LeadStage;
    lostReason?: LostReason;
    lostReasonDetail?: string;
    dealValue?: number;
    note?: string;
    nextFollowUpAt?: Date;
    nextFollowUpNote?: string;
  },
): Promise<ILead> {
  const lead = await Lead.findOne(scoped(ctx.organizationId, { _id: new Types.ObjectId(leadId) }));
  if (!lead) throw new NotFoundError('Lead not found');

  const from = lead.stage;
  if (from === input.stage && !input.nextFollowUpAt) return lead;

  lead.stage = input.stage;

  if (input.stage === 'LOST') {
    lead.lostReason = input.lostReason;
    lead.lostReasonDetail = input.lostReasonDetail;
  }
  if (input.stage === 'WON' && input.dealValue !== undefined) {
    lead.dealValue = input.dealValue;
  }
  if (input.nextFollowUpAt) {
    lead.nextFollowUpAt = input.nextFollowUpAt;
    lead.nextFollowUpNote = input.nextFollowUpNote;
  }

  lead.updatedBy = new Types.ObjectId(ctx.userId);
  await lead.save();

  await logSystemActivity(lead, ctx, 'STAGE_CHANGE', input.note || `Stage changed`, {
    from,
    to: input.stage,
  });

  return lead;
}

/* ------------------------------------------------------------------ *
 * Assignment
 * ------------------------------------------------------------------ */

export async function assignLead(
  ctx: ActorContext,
  leadId: string,
  assigneeId: string | null,
): Promise<ILead> {
  const lead = await Lead.findOne(scoped(ctx.organizationId, { _id: new Types.ObjectId(leadId) }));
  if (!lead) throw new NotFoundError('Lead not found');

  const previous = lead.assignedToName ?? 'Unassigned';

  if (assigneeId) {
    const assignee = await User.findOne({
      _id: assigneeId,
      organizationId: ctx.organizationId,
      isDeleted: false,
      isActive: true,
    })
      .select('name')
      .lean();
    if (!assignee) throw new NotFoundError('The selected team member was not found');

    lead.assignedTo = new Types.ObjectId(assigneeId);
    lead.assignedToName = assignee.name;
    lead.assignedAt = new Date();
  } else {
    lead.assignedTo = undefined;
    lead.assignedToName = undefined;
    lead.assignedAt = undefined;
  }

  lead.updatedBy = new Types.ObjectId(ctx.userId);
  await lead.save();

  await logSystemActivity(lead, ctx, 'ASSIGNMENT', 'Lead reassigned', {
    from: previous,
    to: lead.assignedToName ?? 'Unassigned',
  });

  return lead;
}

/* ------------------------------------------------------------------ *
 * Follow-up rescheduling
 * ------------------------------------------------------------------ */

export async function rescheduleFollowUp(
  ctx: ActorContext,
  leadId: string,
  at: Date,
  note?: string,
  reason?: string,
): Promise<ILead> {
  const lead = await Lead.findOne(scoped(ctx.organizationId, { _id: new Types.ObjectId(leadId) }));
  if (!lead) throw new NotFoundError('Lead not found');

  const previous = lead.nextFollowUpAt;
  lead.nextFollowUpAt = at;
  lead.nextFollowUpNote = note;
  lead.updatedBy = new Types.ObjectId(ctx.userId);
  await lead.save();

  await logSystemActivity(lead, ctx, 'FOLLOW_UP_SET', reason || 'Follow-up rescheduled', {
    from: previous?.toISOString(),
    to: at.toISOString(),
  });

  return lead;
}

/* ------------------------------------------------------------------ *
 * Soft delete / restore
 * ------------------------------------------------------------------ */

export async function softDeleteLead(ctx: ActorContext, leadId: string): Promise<void> {
  const result = await Lead.updateOne(scoped(ctx.organizationId, { _id: new Types.ObjectId(leadId) }), {
    $set: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: new Types.ObjectId(ctx.userId),
    },
  });

  if (result.matchedCount === 0) throw new NotFoundError('Lead not found');
}

export async function restoreLead(ctx: ActorContext, leadId: string): Promise<void> {
  const result = await Lead.updateOne(
    scoped(ctx.organizationId, { _id: new Types.ObjectId(leadId) }, { includeDeleted: true }),
    { $set: { isDeleted: false }, $unset: { deletedAt: '', deletedBy: '' } },
  );

  if (result.matchedCount === 0) throw new NotFoundError('Lead not found');
}

/* ------------------------------------------------------------------ *
 * Internal
 * ------------------------------------------------------------------ */

async function logSystemActivity(
  lead: ILead,
  ctx: ActorContext,
  type: ActivityType,
  subject: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await Activity.create({
    organizationId: lead.organizationId,
    leadId: lead._id,
    type,
    subject,
    status: 'COMPLETED',
    metadata,
    performedBy: new Types.ObjectId(ctx.userId),
    performedByName: ctx.userName,
  });
}
