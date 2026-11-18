import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/connect';
import { Lead } from '@/lib/models';
import { requireOrgUser } from '@/lib/auth/session';
import { ForbiddenError } from '@/lib/auth/session';
import { leadQuerySchema, leadInputSchema, quickAddLeadSchema } from '@/lib/validation/lead';
import { buildLeadFilter, buildLeadSort, LEAD_LIST_PROJECTION } from '@/lib/services/leadQuery';
import { createLead, findDuplicateByPhone } from '@/lib/services/leadService';
import { pickAllowed, LEAD_WRITABLE_FIELDS } from '@/lib/db/repository';
import { ok, created, handleApiError, paginationMeta } from '@/lib/api/response';
import { writeAudit, auditContextFrom } from '@/lib/services/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ *
 * GET /api/leads — list with filters, search, sort and pagination
 * ------------------------------------------------------------------ */
export async function GET(req: NextRequest) {
  try {
    const user = await requireOrgUser();
    await connectDB();

    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = leadQuerySchema.parse(params);

    const filter = buildLeadFilter(
      {
        organizationId: user.organizationId!,
        userId: user.id,
        seesAllLeads: user.seesAllLeads,
        timezone: user.orgTimezone,
        slaMinutes: user.orgSettings.leadResponseSlaMinutes ?? 30,
      },
      query,
    );

    const skip = (query.page - 1) * query.limit;

    // Count and page run together — on a 60-lead dataset this is trivial, and it
    // stays correct as the dataset grows.
    const [items, total] = await Promise.all([
      Lead.find(filter)
        .select(LEAD_LIST_PROJECTION)
        .sort(buildLeadSort(query.sort))
        .skip(skip)
        .limit(query.limit)
        .lean(),
      Lead.countDocuments(filter),
    ]);

    return ok(items, paginationMeta(total, query.page, query.limit));
  } catch (err) {
    return handleApiError(err);
  }
}

/* ------------------------------------------------------------------ *
 * POST /api/leads — create (full form or quick add)
 * ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  try {
    const user = await requireOrgUser();
    if (!user.can('lead:create')) throw new ForbiddenError();

    await connectDB();

    const raw = await req.json().catch(() => ({}));
    const isQuickAdd = raw?.mode === 'quick';
    const allowDuplicate = raw?.allowDuplicate === true;
    delete raw.mode;
    delete raw.allowDuplicate;

    let payload: Record<string, unknown>;

    if (isQuickAdd) {
      const parsed = quickAddLeadSchema.parse(raw);
      // Quick add captures city/area flat; expand into the address sub-document.
      const { city, area, ...rest } = parsed;
      payload = { ...rest, address: { city, area } };
    } else {
      payload = leadInputSchema.parse(raw) as unknown as Record<string, unknown>;
    }

    // Second layer against mass assignment: even a valid Zod payload cannot set
    // server-owned fields such as score, leadCode or organizationId.
    const safe = pickAllowed(payload, [...LEAD_WRITABLE_FIELDS, 'address']);

    const lead = await createLead(
      {
        organizationId: user.organizationId!,
        userId: user.id,
        userName: user.name,
        leadCodePrefix: user.orgSettings.leadCodePrefix || 'LD',
      },
      safe,
      { allowDuplicate },
    );

    await writeAudit({
      ...auditContextFrom(req.headers, user),
      action: 'CREATE',
      entityType: 'Lead',
      entityId: lead._id,
      entityLabel: `${lead.leadCode} · ${lead.name}`,
    });

    return created(lead.toJSON());
  } catch (err) {
    return handleApiError(err);
  }
}
