import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db/connect';
import { User, Organization } from '@/lib/models';
import { loginSchema } from '@/lib/validation/auth';
import { signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/jwt';
import { ok, fail, handleApiError } from '@/lib/api/response';
import { rateLimit, resetRateLimit, clientIp } from '@/lib/api/rateLimit';
import { writeAudit } from '@/lib/services/audit';
import type { Role } from '@/lib/constants/enums';

export const runtime = 'nodejs';

/** Failed attempts before the account is temporarily locked. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const userAgent = req.headers.get('user-agent') ?? undefined;

  try {
    // Coarse per-IP throttle. Blocks bulk credential stuffing before it reaches
    // the database at all.
    const ipLimit = rateLimit(`login:ip:${ip}`, {
      limit: 20,
      windowMs: 10 * 60 * 1000,
      blockMs: 10 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return fail(`Too many attempts. Try again in ${Math.ceil(ipLimit.retryAfterSeconds / 60)} minutes.`, 429);
    }

    const body = await req.json().catch(() => ({}));
    const { email, password, rememberMe } = loginSchema.parse(body);

    await connectDB();

    // `+passwordHash` is required because the field is `select: false`.
    const user = await User.findOne({ email, isDeleted: false }).select('+passwordHash');

    // Uniform failure message: never reveal whether the email exists.
    const INVALID = 'Incorrect email or password';

    if (!user) {
      await writeAudit({
        action: 'LOGIN_FAILED',
        userEmail: email,
        ipAddress: ip,
        userAgent,
        success: false,
        meta: { reason: 'unknown_email' },
      });
      return fail(INVALID, 401);
    }

    // Per-account lockout, stored in the database so it holds across all
    // serverless instances — this is the real defence for a targeted attack.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return fail(`Account locked due to repeated failed attempts. Try again in ${minutes} minute(s).`, 423);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
        user.failedLoginAttempts = 0;
      }
      await user.save();

      await writeAudit({
        organizationId: user.organizationId,
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        action: 'LOGIN_FAILED',
        ipAddress: ip,
        userAgent,
        success: false,
        meta: { reason: 'bad_password' },
      });

      return fail(INVALID, 401);
    }

    if (!user.isActive) {
      return fail('This account has been deactivated. Contact your administrator.', 403);
    }

    // A suspended tenant locks out all of its users.
    if (user.organizationId) {
      const org = await Organization.findOne({ _id: user.organizationId }).lean();
      if (!org || !org.isActive) {
        return fail('This organisation is currently inactive. Contact support.', 403);
      }
    }

    // Successful login: clear the failure counters.
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();

    resetRateLimit(`login:ip:${ip}`);

    const { token, maxAge } = await signSession(
      {
        sub: String(user._id),
        orgId: user.organizationId ? String(user.organizationId) : null,
        role: user.role as Role,
        name: user.name,
        email: user.email,
        pwd: user.passwordChangedAt
          ? Math.floor(new Date(user.passwordChangedAt).getTime() / 1000)
          : Math.floor(Date.now() / 1000),
      },
      rememberMe ?? false,
    );

    await writeAudit({
      organizationId: user.organizationId,
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      action: 'LOGIN',
      ipAddress: ip,
      userAgent,
    });

    const response = ok({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    });

    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge));
    return response;
  } catch (err) {
    return handleApiError(err);
  }
}

/** Reject any other verb explicitly rather than returning Next's default 405 page. */
export async function GET() {
  return NextResponse.json({ ok: false, error: 'Method not allowed' }, { status: 405 });
}
