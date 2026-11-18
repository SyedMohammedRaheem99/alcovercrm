import { Types } from 'mongoose';
import { Lead, Activity } from '@/lib/models';
import { scoped, withOwnership, type QueryFilter } from '@/lib/db/repository';
import { dayRange, weekRange, monthRange, minutesBetween } from '@/lib/utils/dates';
import { OPEN_STAGES, CLOSED_STAGES } from '@/lib/constants/enums';

/**
 * Dashboard and reporting aggregations.
 *
 * Everything here runs as MongoDB aggregations rather than fetching documents
 * and counting in JavaScript — on the Atlas free tier the difference between
 * "count 5,000 docs in the database" and "ship 5,000 docs to a Lambda" is the
 * difference between a fast dashboard and a timeout.
 */

export interface AnalyticsContext {
  organizationId: string;
  userId: string;
  seesAllLeads: boolean;
  timezone: string;
  slaMinutes: number;
}

function baseFilter(ctx: AnalyticsContext, extra: QueryFilter = {}): QueryFilter {
  const filter = { ...scoped(ctx.organizationId), ...extra };
  return withOwnership(filter, ctx.userId, ctx.seesAllLeads);
}

/* ------------------------------------------------------------------ *
 * Dashboard summary
 * ------------------------------------------------------------------ */

export interface DashboardSummary {
  followUps: { overdue: number; today: number; tomorrow: number; thisWeek: number };
  alerts: { uncontacted: number; slaBreached: number; unassigned: number };
  counts: {
    total: number;
    newToday: number;
    newThisWeek: number;
    newThisMonth: number;
    open: number;
    won: number;
    lost: number;
    contactedThisMonth: number;
  };
  value: { pipelineValue: number; wonValueThisMonth: number; wonValueTotal: number };
  conversionRate: number;
  avgResponseMinutes: number | null;
  siteVisitsToday: number;
}

export async function getDashboardSummary(ctx: AnalyticsContext): Promise<DashboardSummary> {
  const now = new Date();
  const today = dayRange(now, ctx.timezone);
  const tomorrow = dayRange(new Date(now.getTime() + 86400000), ctx.timezone);
  const thisWeek = weekRange(now, ctx.timezone);
  const thisMonth = monthRange(now, ctx.timezone);

  const slaCutoff = new Date(now.getTime() - ctx.slaMinutes * 60000);

  /** Shared by every follow-up bucket, so the counts can never drift apart. */
  const openWithFollowUp = { stage: { $nin: CLOSED_STAGES } };

  const [
    overdue,
    dueToday,
    dueTomorrow,
    dueThisWeek,
    uncontacted,
    slaBreached,
    unassigned,
    total,
    newToday,
    newThisWeek,
    newThisMonth,
    open,
    won,
    lost,
    contactedThisMonth,
    pipelineAgg,
    wonMonthAgg,
    wonTotalAgg,
    responseAgg,
    siteVisitsToday,
  ] = await Promise.all([
    // Follow-up buckets only ever cover leads that are still open. A won or
    // lost deal keeps no pending follow-up, and counting one would send the
    // team chasing a closed lead.
    Lead.countDocuments(baseFilter(ctx, { ...openWithFollowUp, nextFollowUpAt: { $lt: now } })),
    Lead.countDocuments(baseFilter(ctx, { ...openWithFollowUp, nextFollowUpAt: { $gte: now, $lte: today.end } })),
    Lead.countDocuments(
      baseFilter(ctx, { ...openWithFollowUp, nextFollowUpAt: { $gte: tomorrow.start, $lte: tomorrow.end } }),
    ),
    Lead.countDocuments(baseFilter(ctx, { ...openWithFollowUp, nextFollowUpAt: { $gte: now, $lte: thisWeek.end } })),

    // Never contacted and still open.
    Lead.countDocuments(baseFilter(ctx, { firstContactedAt: { $exists: false }, stage: { $in: OPEN_STAGES } })),
    // Uncontacted past the response-time promise — the speed-to-lead alert.
    Lead.countDocuments(
      baseFilter(ctx, {
        firstContactedAt: { $exists: false },
        stage: { $in: OPEN_STAGES },
        createdAt: { $lt: slaCutoff },
      }),
    ),
    Lead.countDocuments(baseFilter(ctx, { assignedTo: { $exists: false }, stage: { $in: OPEN_STAGES } })),

    Lead.countDocuments(baseFilter(ctx)),
    Lead.countDocuments(baseFilter(ctx, { createdAt: { $gte: today.start, $lte: today.end } })),
    Lead.countDocuments(baseFilter(ctx, { createdAt: { $gte: thisWeek.start, $lte: thisWeek.end } })),
    Lead.countDocuments(baseFilter(ctx, { createdAt: { $gte: thisMonth.start, $lte: thisMonth.end } })),
    Lead.countDocuments(baseFilter(ctx, { stage: { $in: OPEN_STAGES } })),
    Lead.countDocuments(baseFilter(ctx, { stage: 'WON' })),
    Lead.countDocuments(baseFilter(ctx, { stage: 'LOST' })),
    Lead.countDocuments(baseFilter(ctx, { firstContactedAt: { $gte: thisMonth.start, $lte: thisMonth.end } })),

    // Expected value of the open pipeline, using the midpoint of the budget range.
    Lead.aggregate([
      { $match: baseFilter(ctx, { stage: { $in: OPEN_STAGES } }) },
      {
        $group: {
          _id: null,
          value: {
            $sum: {
              $ifNull: [
                '$dealValue',
                { $avg: [{ $ifNull: ['$budgetMin', 0] }, { $ifNull: ['$budgetMax', 0] }] },
              ],
            },
          },
        },
      },
    ]),

    Lead.aggregate([
      { $match: baseFilter(ctx, { stage: 'WON', wonAt: { $gte: thisMonth.start, $lte: thisMonth.end } }) },
      { $group: { _id: null, value: { $sum: { $ifNull: ['$dealValue', 0] } } } },
    ]),

    Lead.aggregate([
      { $match: baseFilter(ctx, { stage: 'WON' }) },
      { $group: { _id: null, value: { $sum: { $ifNull: ['$dealValue', 0] } } } },
    ]),

    // Average minutes from lead creation to first successful contact.
    Lead.aggregate([
      {
        $match: baseFilter(ctx, {
          firstContactedAt: { $exists: true },
          createdAt: { $gte: thisMonth.start },
        }),
      },
      {
        $project: {
          minutes: { $divide: [{ $subtract: ['$firstContactedAt', '$createdAt'] }, 60000] },
        },
      },
      // Imported leads can carry a contact time earlier than their created time
      // (historical CSV rows, or clock skew between devices). Those would drag
      // the average negative and make the metric meaningless, so drop them.
      { $match: { minutes: { $gte: 0 } } },
      { $group: { _id: null, avg: { $avg: '$minutes' } } },
    ]),

    Activity.countDocuments({
      ...scoped(ctx.organizationId),
      type: 'SITE_VISIT',
      status: 'PENDING',
      scheduledAt: { $gte: today.start, $lte: today.end },
    }),
  ]);

  const closedTotal = won + lost;

  return {
    followUps: { overdue, today: dueToday, tomorrow: dueTomorrow, thisWeek: dueThisWeek },
    alerts: { uncontacted, slaBreached, unassigned },
    counts: {
      total,
      newToday,
      newThisWeek,
      newThisMonth,
      open,
      won,
      lost,
      contactedThisMonth,
    },
    value: {
      pipelineValue: Math.round(pipelineAgg[0]?.value ?? 0),
      wonValueThisMonth: Math.round(wonMonthAgg[0]?.value ?? 0),
      wonValueTotal: Math.round(wonTotalAgg[0]?.value ?? 0),
    },
    // Conversion is measured against *decided* leads, not all leads — counting
    // still-open leads as failures understates performance badly early on.
    conversionRate: closedTotal > 0 ? Math.round((won / closedTotal) * 100) : 0,
    avgResponseMinutes: responseAgg[0]?.avg != null ? Math.round(responseAgg[0].avg) : null,
    siteVisitsToday,
  };
}

/* ------------------------------------------------------------------ *
 * Breakdowns for charts
 * ------------------------------------------------------------------ */

export interface Bucket {
  key: string;
  count: number;
  value?: number;
}

async function groupBy(
  ctx: AnalyticsContext,
  field: string,
  extra: QueryFilter = {},
  limit = 12,
): Promise<Bucket[]> {
  const rows = await Lead.aggregate([
    { $match: baseFilter(ctx, extra) },
    { $group: { _id: `$${field}`, count: { $sum: 1 }, value: { $sum: { $ifNull: ['$dealValue', 0] } } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  return rows
    .filter((r) => r._id != null && r._id !== '')
    .map((r) => ({ key: String(r._id), count: r.count, value: r.value }));
}

/** Multi-value array fields (materials, productTypes) need unwinding first. */
async function groupByArray(
  ctx: AnalyticsContext,
  field: string,
  extra: QueryFilter = {},
  limit = 12,
): Promise<Bucket[]> {
  const rows = await Lead.aggregate([
    { $match: baseFilter(ctx, extra) },
    { $unwind: `$${field}` },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  return rows.filter((r) => r._id != null).map((r) => ({ key: String(r._id), count: r.count }));
}

export interface DashboardBreakdowns {
  byStage: Bucket[];
  bySource: Bucket[];
  byCity: Bucket[];
  byArea: Bucket[];
  byMaterial: Bucket[];
  byProduct: Bucket[];
  byPriority: Bucket[];
  lostReasons: Bucket[];
}

export async function getBreakdowns(
  ctx: AnalyticsContext,
  range?: { start?: Date; end?: Date },
): Promise<DashboardBreakdowns> {
  const dateFilter: QueryFilter =
    range?.start || range?.end
      ? {
          createdAt: {
            ...(range.start ? { $gte: range.start } : {}),
            ...(range.end ? { $lte: range.end } : {}),
          },
        }
      : {};

  const [byStage, bySource, byCity, byArea, byMaterial, byProduct, byPriority, lostReasons] =
    await Promise.all([
      groupBy(ctx, 'stage', dateFilter, 12),
      groupBy(ctx, 'source', dateFilter, 12),
      groupBy(ctx, 'address.city', dateFilter, 10),
      groupBy(ctx, 'address.area', dateFilter, 10),
      groupByArray(ctx, 'materials', dateFilter, 8),
      groupByArray(ctx, 'productTypes', dateFilter, 10),
      groupBy(ctx, 'priority', dateFilter, 3),
      groupBy(ctx, 'lostReason', { ...dateFilter, stage: 'LOST' }, 10),
    ]);

  return { byStage, bySource, byCity, byArea, byMaterial, byProduct, byPriority, lostReasons };
}

/* ------------------------------------------------------------------ *
 * Trend — leads created per day
 * ------------------------------------------------------------------ */

export interface TrendPoint {
  date: string;
  created: number;
  won: number;
}

export async function getLeadTrend(ctx: AnalyticsContext, days = 30): Promise<TrendPoint[]> {
  const start = new Date(Date.now() - days * 86400000);

  const [createdRows, wonRows] = await Promise.all([
    Lead.aggregate([
      { $match: baseFilter(ctx, { createdAt: { $gte: start } }) },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: ctx.timezone } },
          count: { $sum: 1 },
        },
      },
    ]),
    Lead.aggregate([
      { $match: baseFilter(ctx, { stage: 'WON', wonAt: { $gte: start } }) },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$wonAt', timezone: ctx.timezone } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const createdMap = new Map(createdRows.map((r) => [r._id as string, r.count as number]));
  const wonMap = new Map(wonRows.map((r) => [r._id as string, r.count as number]));

  // Emit a point per day including zeros, so the chart shows real gaps rather
  // than joining across missing days and implying activity that did not happen.
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toLocaleDateString('en-CA', { timeZone: ctx.timezone });
    points.push({ date: key, created: createdMap.get(key) ?? 0, won: wonMap.get(key) ?? 0 });
  }

  return points;
}

/* ------------------------------------------------------------------ *
 * Source ROI funnel — which channels actually produce revenue
 * ------------------------------------------------------------------ */

export interface SourcePerformance {
  source: string;
  total: number;
  contacted: number;
  qualified: number;
  won: number;
  lost: number;
  wonValue: number;
  conversionRate: number;
}

export async function getSourcePerformance(
  ctx: AnalyticsContext,
  range?: { start?: Date; end?: Date },
): Promise<SourcePerformance[]> {
  const dateFilter: QueryFilter =
    range?.start || range?.end
      ? {
          createdAt: {
            ...(range.start ? { $gte: range.start } : {}),
            ...(range.end ? { $lte: range.end } : {}),
          },
        }
      : {};

  const rows = await Lead.aggregate([
    { $match: baseFilter(ctx, dateFilter) },
    {
      $group: {
        _id: '$source',
        total: { $sum: 1 },
        contacted: { $sum: { $cond: [{ $ifNull: ['$firstContactedAt', false] }, 1, 0] } },
        qualified: {
          $sum: {
            $cond: [
              { $in: ['$stage', ['QUALIFIED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_DONE', 'QUOTED', 'NEGOTIATION', 'WON']] },
              1,
              0,
            ],
          },
        },
        won: { $sum: { $cond: [{ $eq: ['$stage', 'WON'] }, 1, 0] } },
        lost: { $sum: { $cond: [{ $eq: ['$stage', 'LOST'] }, 1, 0] } },
        wonValue: { $sum: { $cond: [{ $eq: ['$stage', 'WON'] }, { $ifNull: ['$dealValue', 0] }, 0] } },
      },
    },
    { $sort: { total: -1 } },
  ]);

  return rows.map((r) => {
    const decided = r.won + r.lost;
    return {
      source: String(r._id ?? 'OTHER'),
      total: r.total,
      contacted: r.contacted,
      qualified: r.qualified,
      won: r.won,
      lost: r.lost,
      wonValue: r.wonValue,
      conversionRate: decided > 0 ? Math.round((r.won / decided) * 100) : 0,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Team performance
 * ------------------------------------------------------------------ */

export interface TeamPerformance {
  userId: string;
  name: string;
  assigned: number;
  contacted: number;
  won: number;
  lost: number;
  wonValue: number;
  overdue: number;
  activities: number;
}

export async function getTeamPerformance(
  ctx: AnalyticsContext,
  range?: { start?: Date; end?: Date },
): Promise<TeamPerformance[]> {
  const now = new Date();
  const dateFilter: QueryFilter =
    range?.start || range?.end
      ? {
          createdAt: {
            ...(range.start ? { $gte: range.start } : {}),
            ...(range.end ? { $lte: range.end } : {}),
          },
        }
      : {};

  const [leadRows, activityRows] = await Promise.all([
    Lead.aggregate([
      { $match: { ...scoped(ctx.organizationId), ...dateFilter, assignedTo: { $exists: true } } },
      {
        $group: {
          _id: '$assignedTo',
          name: { $first: '$assignedToName' },
          assigned: { $sum: 1 },
          contacted: { $sum: { $cond: [{ $ifNull: ['$firstContactedAt', false] }, 1, 0] } },
          won: { $sum: { $cond: [{ $eq: ['$stage', 'WON'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$stage', 'LOST'] }, 1, 0] } },
          wonValue: { $sum: { $cond: [{ $eq: ['$stage', 'WON'] }, { $ifNull: ['$dealValue', 0] }, 0] } },
          overdue: {
            $sum: {
              $cond: [{ $and: [{ $ifNull: ['$nextFollowUpAt', false] }, { $lt: ['$nextFollowUpAt', now] }] }, 1, 0],
            },
          },
        },
      },
      { $sort: { assigned: -1 } },
    ]),

    Activity.aggregate([
      {
        $match: {
          ...scoped(ctx.organizationId),
          ...(range?.start ? { createdAt: { $gte: range.start, ...(range.end ? { $lte: range.end } : {}) } } : {}),
          performedBy: { $exists: true },
        },
      },
      { $group: { _id: '$performedBy', count: { $sum: 1 } } },
    ]),
  ]);

  const activityMap = new Map(activityRows.map((r) => [String(r._id), r.count as number]));

  return leadRows.map((r) => ({
    userId: String(r._id),
    name: r.name ?? 'Unknown',
    assigned: r.assigned,
    contacted: r.contacted,
    won: r.won,
    lost: r.lost,
    wonValue: r.wonValue,
    overdue: r.overdue,
    activities: activityMap.get(String(r._id)) ?? 0,
  }));
}
