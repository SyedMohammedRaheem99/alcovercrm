import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/connect';
import { User } from '@/lib/models';
import { requireOrgUser } from '@/lib/auth/session';
import { ok, handleApiError } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/team — active members, for assignment dropdowns and filters.
 *
 * Readable by any signed-in member (a salesperson needs to see who a lead is
 * assigned to); managing users is a separate, permission-gated endpoint.
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireOrgUser();
    await connectDB();

    const members = await User.find({
      organizationId: user.organizationId,
      isDeleted: false,
      isActive: true,
    })
      .select('name email role avatarColor')
      .sort({ name: 1 })
      .lean();

    return ok(
      members.map((m) => ({
        id: String(m._id),
        name: m.name,
        email: m.email,
        role: m.role,
        avatarColor: m.avatarColor,
      })),
    );
  } catch (err) {
    return handleApiError(err);
  }
}
