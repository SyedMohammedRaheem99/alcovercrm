import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db/connect';
import { User } from '@/lib/models';
import { changePasswordSchema } from '@/lib/validation/auth';
import { requireUser } from '@/lib/auth/session';
import { signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/jwt';
import { ok, fail, handleApiError } from '@/lib/api/response';
import { writeAudit, auditContextFrom } from '@/lib/services/audit';
import type { Role } from '@/lib/constants/enums';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const current = await requireUser();
    const body = await req.json().catch(() => ({}));
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    await connectDB();
    const user = await User.findById(current.id).select('+passwordHash');
    if (!user) return fail('Account not found', 404);

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return fail('Your current password is incorrect', 401);

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    // Invalidates every previously issued token for this user.
    user.passwordChangedAt = new Date();
    await user.save();

    await writeAudit({ ...auditContextFrom(req.headers, current), action: 'PASSWORD_CHANGE' });

    // Re-issue this session so the current device stays signed in.
    const { token, maxAge } = await signSession({
      sub: String(user._id),
      orgId: user.organizationId ? String(user.organizationId) : null,
      role: user.role as Role,
      name: user.name,
      email: user.email,
      pwd: Math.floor(user.passwordChangedAt.getTime() / 1000),
    });

    const response = ok({ changed: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
