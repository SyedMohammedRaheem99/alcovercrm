import { cookies } from 'next/headers';
import { cache } from 'react';
import { Types } from 'mongoose';
import { connectDB } from '@/lib/db/connect';
import { User, Organization, type IOrgSettings } from '@/lib/models';
import { SESSION_COOKIE, verifySession, type SessionPayload } from './jwt';
import { can, seesAllLeads, type Permission } from './permissions';
import type { Role } from '@/lib/constants/enums';

/**
 * Server-side session resolution.
 *
 * `getSession()` verifies the cookie only (cheap, no database round trip) and is
 * what middleware-adjacent code uses. `getCurrentUser()` additionally loads the
 * user and organisation, and is what any handler touching data should use — it
 * catches users who were deactivated or deleted after their token was issued.
 */

export interface CurrentUser {
  id: string;
  organizationId: string | null;
  name: string;
  email: string;
  role: Role;
  avatarColor: string;
  orgName: string;
  orgSettings: IOrgSettings;
  orgTimezone: string;
  /** Convenience helpers so handlers do not re-import the permission module. */
  can: (permission: Permission) => boolean;
  seesAllLeads: boolean;
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Resolve the full current user. Memoised per request with React `cache`, so
 * calling it in a layout and three components hits the database once.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;

  await connectDB();

  const user = await User.findOne({
    _id: session.sub,
    isDeleted: false,
    isActive: true,
  }).lean();

  // Deactivated, deleted, or the token refers to a user that no longer exists.
  if (!user) return null;

  // Password changed after this token was issued -> force re-login everywhere.
  if (user.passwordChangedAt) {
    const changedAtSeconds = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
    if (!session.pwd || session.pwd < changedAtSeconds) return null;
  }

  // The role in the token could be stale (an admin may have demoted them);
  // the database is the authority.
  const role = user.role as Role;

  let orgName = 'Platform';
  let orgSettings: IOrgSettings | null = null;
  let orgTimezone = 'Asia/Kolkata';

  if (user.organizationId) {
    const org = await Organization.findOne({ _id: user.organizationId, isActive: true }).lean();
    // A suspended organisation locks out all of its users.
    if (!org) return null;
    orgName = org.name;
    orgSettings = org.settings;
    orgTimezone = org.timezone;
  }

  const settings = orgSettings ?? ({} as IOrgSettings);

  return {
    id: String(user._id),
    organizationId: user.organizationId ? String(user.organizationId) : null,
    name: user.name,
    email: user.email,
    role,
    avatarColor: user.avatarColor,
    orgName,
    orgSettings: settings,
    orgTimezone,
    can: (permission: Permission) => can(role, permission),
    seesAllLeads: seesAllLeads(role, settings.salesSeeAllLeads ?? false),
  };
});

/** Throwing variants for routes that must have an authenticated user. */
export class UnauthorizedError extends Error {
  constructor(message = 'You need to sign in to continue') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.can(permission)) throw new ForbiddenError();
  return user;
}

/**
 * Every tenant-scoped handler starts here.
 *
 * Returns the organisation id as an ObjectId, guaranteed to come from the signed
 * session rather than from anything the client sent. A SUPER_ADMIN without an
 * organisation cannot use tenant-scoped routes — they act through the admin
 * area instead.
 */
export async function requireOrgUser(): Promise<CurrentUser & { orgObjectId: Types.ObjectId }> {
  const user = await requireUser();
  if (!user.organizationId) {
    throw new ForbiddenError('This account is not attached to an organisation');
  }
  return { ...user, orgObjectId: new Types.ObjectId(user.organizationId) };
}
