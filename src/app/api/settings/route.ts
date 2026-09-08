import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/connect';
import { Organization } from '@/lib/models';
import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { orgProfileSchema, orgSettingsSchema } from '@/lib/validation/settings';
import { ok, handleApiError, NotFoundError } from '@/lib/api/response';
import { writeAudit, auditContextFrom, diffChanges } from '@/lib/services/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await requireOrgUser();
    await connectDB();

    const org = await Organization.findById(user.organizationId).lean();
    if (!org) throw new NotFoundError('Organisation not found');

    return ok({
      name: org.name,
      phone: org.phone,
      email: org.email,
      gstin: org.gstin,
      address: org.address,
      timezone: org.timezone,
      currency: org.currency,
      settings: org.settings,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** PATCH — update the business profile and/or the behaviour settings. */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireOrgUser();
    if (!user.can('settings:manage')) throw new ForbiddenError();

    await connectDB();

    const body = await req.json().catch(() => ({}));
    const profile = orgProfileSchema.parse(body.profile ?? {});
    const settings = orgSettingsSchema.parse(body.settings ?? {});

    const org = await Organization.findById(user.organizationId);
    if (!org) throw new NotFoundError('Organisation not found');

    const before = { ...org.toObject().settings, name: org.name };

    Object.assign(org, profile);

    // Merge rather than replace, so a partial update cannot wipe unsent settings.
    // `businessHours` is merged one level deeper as well — a payload containing
    // only `{ start }` would otherwise drop `end` and `workingDays`.
    const current = org.toObject().settings;
    const { businessHours, ...flatSettings } = settings;

    org.settings = {
      ...current,
      ...flatSettings,
      businessHours: businessHours
        ? { ...current.businessHours, ...businessHours }
        : current.businessHours,
    };

    await org.save();

    const changes = diffChanges(
      before as Record<string, unknown>,
      { ...org.toObject().settings, name: org.name } as Record<string, unknown>,
    );

    if (Object.keys(changes).length > 0) {
      await writeAudit({
        ...auditContextFrom(req.headers, user),
        action: 'SETTINGS_CHANGE',
        entityType: 'Organization',
        entityId: org._id,
        changes,
      });
    }

    return ok({ saved: true, settings: org.settings });
  } catch (err) {
    return handleApiError(err);
  }
}
