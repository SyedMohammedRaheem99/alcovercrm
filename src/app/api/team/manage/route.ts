import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db/connect';
import { User } from '@/lib/models';
import { requireOrgUser, ForbiddenError } from '@/lib/auth/session';
import { canAssignRole, canManageUser } from '@/lib/auth/permissions';
import { createUserSchema, updateUserSchema, resetPasswordSchema } from '@/lib/validation/auth';
import { ok, created, fail, handleApiError, NotFoundError, ConflictError } from '@/lib/api/response';
import { writeAudit, auditContextFrom } from '@/lib/services/audit';
import { pickAvatarColor } from '@/lib/models/User';
import type { Role } from '@/lib/constants/enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — full team list with status, for the management screen. */
export async function GET() {
  try {
    const user = await requireOrgUser();
    if (!user.can('user:manage')) throw new ForbiddenError();

    await connectDB();

    const members = await User.find({ organizationId: user.organizationId, isDeleted: false })
      .select('name email phone role isActive lastLoginAt avatarColor createdAt')
      .sort({ role: 1, name: 1 })
      .lean();

    return ok(
      members.map((m) => ({
        id: String(m._id),
        name: m.name,
        email: m.email,
        phone: m.phone,
        role: m.role,
        isActive: m.isActive,
        lastLoginAt: m.lastLoginAt,
        avatarColor: m.avatarColor,
        createdAt: m.createdAt,
        isSelf: String(m._id) === user.id,
      })),
    );
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST — add a team member. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireOrgUser();
    if (!user.can('user:manage')) throw new ForbiddenError();

    await connectDB();

    const input = createUserSchema.parse(await req.json().catch(() => ({})));
    const role = input.role as Role;

    // An admin must never be able to mint a peer or a super admin.
    if (!canAssignRole(user.role, role)) {
      throw new ForbiddenError('You cannot assign that role');
    }

    const existing = await User.findOne({ email: input.email }).lean();
    if (existing) throw new ConflictError('An account with this email already exists');

    const member = await User.create({
      organizationId: new Types.ObjectId(user.organizationId!),
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await bcrypt.hash(input.password, 12),
      role,
      avatarColor: pickAvatarColor(input.email),
      targets: {
        monthlyLeadTarget: input.monthlyLeadTarget,
        monthlyRevenueTarget: input.monthlyRevenueTarget,
      },
      createdBy: new Types.ObjectId(user.id),
    });

    await writeAudit({
      ...auditContextFrom(req.headers, user),
      action: 'CREATE',
      entityType: 'User',
      entityId: member._id,
      entityLabel: `${member.name} (${member.email})`,
      meta: { role },
    });

    return created({ id: String(member._id), name: member.name, email: member.email, role: member.role });
  } catch (err) {
    return handleApiError(err);
  }
}

/** PATCH — edit a member, or reset their password. */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireOrgUser();
    if (!user.can('user:manage')) throw new ForbiddenError();

    await connectDB();

    const body = await req.json().catch(() => ({}));

    /* ---- Password reset ---- */
    if (body.action === 'RESET_PASSWORD') {
      // `action` is routing metadata, not part of the payload. The schema is
      // `.strict()`, so it must be removed before validation or every reset
      // fails with "Unrecognized key(s)".
      const { action: _action, ...payload } = body;
      const input = resetPasswordSchema.parse(payload);
      const target = await User.findOne({
        _id: input.userId,
        organizationId: user.organizationId,
        isDeleted: false,
      });
      if (!target) throw new NotFoundError('Team member not found');

      if (!canManageUser(user.role, user.id, target.role as Role, String(target._id))) {
        throw new ForbiddenError('You cannot change that account');
      }

      target.passwordHash = await bcrypt.hash(input.newPassword, 12);
      // Invalidates every session that account currently has.
      target.passwordChangedAt = new Date();
      target.failedLoginAttempts = 0;
      target.lockedUntil = undefined;
      await target.save();

      await writeAudit({
        ...auditContextFrom(req.headers, user),
        action: 'PASSWORD_RESET',
        entityType: 'User',
        entityId: target._id,
        entityLabel: `${target.name} (${target.email})`,
      });

      return ok({ reset: true });
    }

    /* ---- Profile / role / status ---- */
    const userId = String(body.userId ?? '');
    if (!Types.ObjectId.isValid(userId)) return fail('Invalid user id', 400);

    const input = updateUserSchema.parse(body.updates ?? {});

    const target = await User.findOne({
      _id: userId,
      organizationId: user.organizationId,
      isDeleted: false,
    });
    if (!target) throw new NotFoundError('Team member not found');

    if (!canManageUser(user.role, user.id, target.role as Role, String(target._id))) {
      throw new ForbiddenError('You cannot change that account');
    }

    if (input.role && !canAssignRole(user.role, input.role as Role)) {
      throw new ForbiddenError('You cannot assign that role');
    }

    // Locking yourself out of your own organisation is never intentional.
    if (String(target._id) === user.id && input.isActive === false) {
      return fail('You cannot deactivate your own account', 400);
    }

    const previousRole = target.role;

    if (input.name !== undefined) target.name = input.name;
    if (input.phone !== undefined) target.phone = input.phone;
    if (input.role !== undefined) target.role = input.role as Role;
    if (input.isActive !== undefined) target.isActive = input.isActive;
    if (input.monthlyLeadTarget !== undefined || input.monthlyRevenueTarget !== undefined) {
      target.targets = {
        monthlyLeadTarget: input.monthlyLeadTarget ?? target.targets?.monthlyLeadTarget,
        monthlyRevenueTarget: input.monthlyRevenueTarget ?? target.targets?.monthlyRevenueTarget,
      };
    }

    target.updatedBy = new Types.ObjectId(user.id);
    await target.save();

    await writeAudit({
      ...auditContextFrom(req.headers, user),
      action: input.role && input.role !== previousRole ? 'ROLE_CHANGE' : 'UPDATE',
      entityType: 'User',
      entityId: target._id,
      entityLabel: `${target.name} (${target.email})`,
      meta: input.role ? { from: previousRole, to: input.role } : undefined,
    });

    return ok({ saved: true });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE — soft-delete a member (their leads and history stay intact). */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requireOrgUser();
    if (!user.can('user:manage')) throw new ForbiddenError();

    await connectDB();

    const userId = req.nextUrl.searchParams.get('userId') ?? '';
    if (!Types.ObjectId.isValid(userId)) return fail('Invalid user id', 400);
    if (userId === user.id) return fail('You cannot remove your own account', 400);

    const target = await User.findOne({
      _id: userId,
      organizationId: user.organizationId,
      isDeleted: false,
    });
    if (!target) throw new NotFoundError('Team member not found');

    if (!canManageUser(user.role, user.id, target.role as Role, String(target._id))) {
      throw new ForbiddenError('You cannot remove that account');
    }

    target.isDeleted = true;
    target.isActive = false;
    target.deletedAt = new Date();
    target.deletedBy = new Types.ObjectId(user.id);
    await target.save();

    await writeAudit({
      ...auditContextFrom(req.headers, user),
      action: 'DELETE',
      entityType: 'User',
      entityId: target._id,
      entityLabel: `${target.name} (${target.email})`,
    });

    return ok({ removed: true });
  } catch (err) {
    return handleApiError(err);
  }
}
