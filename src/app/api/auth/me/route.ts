import { getCurrentUser } from '@/lib/auth/session';
import { permissionsFor } from '@/lib/auth/permissions';
import { ok, fail, handleApiError } from '@/lib/api/response';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return fail('Not signed in', 401);

    return ok({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarColor: user.avatarColor,
      organizationId: user.organizationId,
      orgName: user.orgName,
      orgTimezone: user.orgTimezone,
      seesAllLeads: user.seesAllLeads,
      permissions: permissionsFor(user.role),
      settings: {
        requireNextActionOnCall: user.orgSettings.requireNextActionOnCall,
        leadResponseSlaMinutes: user.orgSettings.leadResponseSlaMinutes,
        whatsappCountryCode: user.orgSettings.whatsappCountryCode,
        quotationValidityDays: user.orgSettings.quotationValidityDays,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
