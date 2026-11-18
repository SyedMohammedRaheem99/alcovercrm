import { Types } from 'mongoose';
import { scoped, withOwnership, safeRegex, type QueryFilter } from '@/lib/db/repository';
import { OPEN_STAGES } from '@/lib/constants/enums';
import { parseDateRangeParam, dayRange, weekRange } from '@/lib/utils/dates';
import { normalizePhone } from '@/lib/utils/phone';
import type { LeadQuery } from '@/lib/validation/lead';

/**
 * Translate validated list filters into a MongoDB query.
 *
 * Kept separate from the route so the same filter logic backs the list view,
 * the CSV export and the analytics counts — otherwise "export what I'm looking
 * at" silently exports something different from what is on screen.
 */

export interface BuildQueryContext {
  organizationId: string;
  userId: string;
  seesAllLeads: boolean;
  timezone: string;
  /** Response-time target, used by the `slaBreached` filter. */
  slaMinutes: number;
}

export function buildLeadFilter(ctx: BuildQueryContext, q: LeadQuery): QueryFilter {
  const conditions: QueryFilter = {};

  /* ---- Multi-select facets ---- */
  if (q.stage.length) conditions.stage = { $in: q.stage };
  if (q.priority.length) conditions.priority = { $in: q.priority };
  if (q.source.length) conditions.source = { $in: q.source };
  if (q.material.length) conditions.materials = { $in: q.material };
  if (q.productType.length) conditions.productTypes = { $in: q.productType };
  if (q.propertyType.length) conditions.propertyType = { $in: q.propertyType };
  if (q.timeline.length) conditions.timeline = { $in: q.timeline };

  /* ---- Location ---- */
  if (q.city) conditions['address.city'] = safeRegex(q.city);
  if (q.area) conditions['address.area'] = safeRegex(q.area);
  if (q.tag) conditions.tags = q.tag;

  /* ---- Assignment ---- */
  if (q.assignedTo === 'unassigned') {
    conditions.assignedTo = { $exists: false };
  } else if (q.assignedTo === 'me') {
    conditions.assignedTo = new Types.ObjectId(ctx.userId);
  } else if (q.assignedTo && Types.ObjectId.isValid(q.assignedTo)) {
    conditions.assignedTo = new Types.ObjectId(q.assignedTo);
  }

  /* ---- Follow-up buckets ---- */
  const now = new Date();
  if (q.followUp) {
    const today = dayRange(now, ctx.timezone);
    const thisWeek = weekRange(now, ctx.timezone);

    switch (q.followUp) {
      case 'OVERDUE':
        conditions.nextFollowUpAt = { $lt: now };
        break;
      case 'TODAY':
        conditions.nextFollowUpAt = { $gte: now, $lte: today.end };
        break;
      case 'TOMORROW': {
        const tomorrow = dayRange(new Date(now.getTime() + 86400000), ctx.timezone);
        conditions.nextFollowUpAt = { $gte: tomorrow.start, $lte: tomorrow.end };
        break;
      }
      case 'THIS_WEEK':
        conditions.nextFollowUpAt = { $gte: now, $lte: thisWeek.end };
        break;
      case 'LATER':
        conditions.nextFollowUpAt = { $gt: thisWeek.end };
        break;
      case 'NONE':
        conditions.nextFollowUpAt = { $exists: false };
        conditions.stage = conditions.stage ?? { $nin: ['WON', 'LOST'] };
        break;
    }
  }

  /* ---- Uncontacted (SLA breach candidates) ----
   * `slaBreached` reproduces the dashboard alert exactly — same three
   * conditions, same cutoff — so the banner's count and this list can never
   * disagree. `uncontacted` stays the looser "never contacted" filter.
   */
  if (q.slaBreached === 'true') {
    conditions.firstContactedAt = { $exists: false };
    conditions.stage = conditions.stage ?? { $in: OPEN_STAGES };
    conditions.createdAt = { $lt: new Date(now.getTime() - ctx.slaMinutes * 60000) };
  } else if (q.uncontacted === 'true') {
    conditions.firstContactedAt = { $exists: false };
    conditions.stage = conditions.stage ?? { $in: OPEN_STAGES };
  }

  /* ---- Created-date range ---- */
  const range = parseDateRangeParam(q.from, q.to, ctx.timezone);
  if (range.start || range.end) {
    // Merge rather than replace: `slaBreached` may already have set an upper
    // bound on `createdAt`, and overwriting it would widen the filter.
    conditions.createdAt = {
      ...(conditions.createdAt as Record<string, unknown> | undefined),
      ...(range.start ? { $gte: range.start } : {}),
      ...(range.end ? { $lte: range.end } : {}),
    };
  }

  /* ---- Free-text search ----
   * A digit-heavy query is almost always someone typing a phone number, so
   * match the normalised phone directly — far faster and more accurate than
   * text search, and it works when the user types spaces or +91.
   */
  if (q.q) {
    const term = q.q.trim();
    const digits = term.replace(/\D/g, '');

    if (digits.length >= 6) {
      const normalized = normalizePhone(term);
      conditions.$or = [
        { phoneNormalized: normalized ? new RegExp(`${normalized}$`) : safeRegex(digits) },
        { altPhoneNormalized: safeRegex(digits) },
        { leadCode: safeRegex(term) },
      ];
    } else {
      const rx = safeRegex(term);
      conditions.$or = [
        { name: rx },
        { leadCode: rx },
        { email: rx },
        { 'address.area': rx },
        { 'address.city': rx },
        { requirementNotes: rx },
      ];
    }
  }

  const includeDeleted = q.includeDeleted === 'true';

  // Scope first (which sanitises), then re-apply the `$` operators this builder
  // constructed itself — those are trusted because they come from validated enums.
  const base = scoped(ctx.organizationId, {}, { includeDeleted });
  const filter: QueryFilter = { ...base, ...conditions };

  return withOwnership(filter, ctx.userId, ctx.seesAllLeads);
}

/** Map the validated `sort` param to a Mongo sort spec. */
export function buildLeadSort(sort: LeadQuery['sort']): Record<string, 1 | -1> {
  const direction = sort.startsWith('-') ? -1 : 1;
  const field = sort.replace(/^-/, '');

  const allowed = ['createdAt', 'updatedAt', 'nextFollowUpAt', 'score', 'name'];
  if (!allowed.includes(field)) return { createdAt: -1 };

  // Secondary sort keeps pagination stable when the primary values tie.
  return { [field]: direction as 1 | -1, _id: -1 };
}

/** Columns needed by the list view — keeps the payload small on mobile data. */
export const LEAD_LIST_PROJECTION = {
  leadCode: 1,
  name: 1,
  phone: 1,
  phoneNormalized: 1,
  email: 1,
  'address.area': 1,
  'address.city': 1,
  materials: 1,
  productTypes: 1,
  stage: 1,
  priority: 1,
  score: 1,
  source: 1,
  assignedTo: 1,
  assignedToName: 1,
  nextFollowUpAt: 1,
  nextFollowUpNote: 1,
  firstContactedAt: 1,
  lastContactedAt: 1,
  contactAttempts: 1,
  dealValue: 1,
  budgetMin: 1,
  budgetMax: 1,
  tags: 1,
  activityCount: 1,
  isDeleted: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;
