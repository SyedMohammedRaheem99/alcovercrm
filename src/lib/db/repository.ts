import { Types } from 'mongoose';
import { sanitizeMongoInput } from '@/lib/utils/sanitize';

/**
 * Mongoose 9 removed the exported `FilterQuery` helper. These builders assemble
 * filters dynamically from request input, so a permissive record type is the
 * honest signature — the safety here comes from the runtime sanitising and the
 * forced organizationId, not from the compiler.
 */
export type QueryFilter = Record<string, unknown>;

/**
 * Tenant scoping helpers.
 *
 * Multi-tenant leaks happen when someone writes `Lead.find({ stage })` and
 * forgets the organisation filter. Every read path in this app builds its filter
 * through `scoped()`, which:
 *   1. always injects `organizationId` from the *session* (never the request),
 *   2. always excludes soft-deleted rows unless explicitly asked,
 *   3. strips any `$` operator keys that arrived from user input.
 *
 * The third point matters: without it, a query value like `{"$ne": null}`
 * smuggled through a filter could widen a query beyond the tenant.
 */

export interface ScopeOptions {
  includeDeleted?: boolean;
}

export function scoped(
  organizationId: string | Types.ObjectId,
  filter: QueryFilter = {},
  options: ScopeOptions = {},
): QueryFilter {
  const safeFilter = sanitizeMongoInput(filter);

  const base: Record<string, unknown> = {
    ...safeFilter,
    // Assigned last so a caller-supplied organizationId can never override it.
    organizationId: typeof organizationId === 'string' ? new Types.ObjectId(organizationId) : organizationId,
  };

  if (!options.includeDeleted) {
    base.isDeleted = false;
  }

  return base;
}

/**
 * Restrict a query to leads the user is allowed to see.
 * MANAGER/ADMIN see everything; SALES sees only their own unless the org opted in.
 */
export function withOwnership(
  filter: QueryFilter,
  userId: string,
  canSeeAll: boolean,
): QueryFilter {
  if (canSeeAll) return filter;
  return { ...filter, assignedTo: new Types.ObjectId(userId) };
}

/** Validate a path parameter before it reaches a query. */
export function toObjectId(id: string | undefined | null): Types.ObjectId | null {
  if (!id || !Types.ObjectId.isValid(id)) return null;
  return new Types.ObjectId(id);
}

/**
 * Whitelist the fields a client may write.
 *
 * Even though Zod already validates shape, this is the second layer that stops
 * mass-assignment: a payload can never set `organizationId`, `createdBy`,
 * `leadCode`, `score` or any other server-owned field.
 */
export function pickAllowed<T extends Record<string, unknown>>(
  input: Record<string, unknown>,
  allowed: readonly string[],
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in input && input[key] !== undefined) {
      out[key] = input[key];
    }
  }
  return out as Partial<T>;
}

/** Fields a client may never set directly on a lead. */
export const LEAD_PROTECTED_FIELDS = [
  'organizationId',
  'leadCode',
  'phoneNormalized',
  'altPhoneNormalized',
  'score',
  'activityCount',
  'quotationCount',
  'createdBy',
  'createdAt',
  'updatedAt',
  'isDeleted',
  'deletedAt',
  'deletedBy',
  'importBatchId',
  'firstContactedAt',
  'contactAttempts',
  'wonAt',
  'lostAt',
  'customerSince',
] as const;

/** Fields a client MAY set on a lead (the inverse whitelist). */
export const LEAD_WRITABLE_FIELDS = [
  'name',
  'phone',
  'altPhone',
  'email',
  'whatsappSameAsPhone',
  'whatsappPhone',
  'address',
  'googleMapsLink',
  'materials',
  'productTypes',
  'glassTypes',
  'approxAreaSqft',
  'unitCount',
  'requirementNotes',
  'propertyType',
  'constructionStage',
  'timeline',
  'budgetMin',
  'budgetMax',
  'decisionMaker',
  'hasCompetitorQuote',
  'competitorNames',
  // `stage` is deliberately NOT writable here. Every stage move must go through
  // `changeStage` (POST /api/leads/:id/stage) so the contact markers, the lost
  // reason and the next-step rule are applied on every path.
  'priority',
  'scoreLocked',
  'source',
  'sourceDetail',
  'referredByLeadId',
  'campaignName',
  'assignedTo',
  'nextFollowUpAt',
  'nextFollowUpNote',
  'dealValue',
  'lostReason',
  'lostReasonDetail',
  'tags',
  'notes',
] as const;

/** Escape user text before using it in a `$regex` search. */
export function safeRegex(input: string): RegExp {
  const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}
