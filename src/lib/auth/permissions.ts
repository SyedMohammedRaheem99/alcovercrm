import { ROLE_RANK, type Role } from '@/lib/constants/enums';

/**
 * Role-based access control.
 *
 * Every permission is checked on the server before a mutation runs. Hiding a
 * button in the UI is a usability choice, never a security control — a SALES
 * user calling the API directly must be rejected here.
 */

export const PERMISSIONS = [
  'lead:view_all', // see every lead in the org, not just their own
  'lead:create',
  'lead:edit',
  'lead:delete',
  'lead:restore',
  'lead:assign',
  'lead:bulk_edit',
  'lead:import',
  'lead:export',
  'activity:create',
  'activity:delete',
  'quotation:create',
  'quotation:edit',
  'quotation:delete',
  'report:view_all', // org-wide analytics rather than only own numbers
  'user:manage',
  'settings:manage',
  'master:manage',
  'backup:run',
  'audit:view',
  'org:manage', // super-admin only: create/suspend tenants
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const SALES_PERMISSIONS: Permission[] = [
  'lead:create',
  'lead:edit',
  'activity:create',
  'quotation:create',
  'quotation:edit',
];

const MANAGER_PERMISSIONS: Permission[] = [
  ...SALES_PERMISSIONS,
  'lead:view_all',
  'lead:delete',
  'lead:restore',
  'lead:assign',
  'lead:bulk_edit',
  'lead:import',
  'activity:delete',
  'quotation:delete',
  'report:view_all',
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...MANAGER_PERMISSIONS,
  'lead:export',
  'user:manage',
  'settings:manage',
  'master:manage',
  'backup:run',
  'audit:view',
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SALES: SALES_PERMISSIONS,
  MANAGER: MANAGER_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  SUPER_ADMIN: [...PERMISSIONS],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAny(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Whether `actor` may modify `target`.
 *
 * Rules: nobody may act on someone of equal or higher rank (so an ADMIN cannot
 * demote another ADMIN or a SUPER_ADMIN), and a user may always edit their own
 * profile.
 */
export function canManageUser(actorRole: Role, actorId: string, targetRole: Role, targetId: string): boolean {
  if (actorId === targetId) return true;
  if (!can(actorRole, 'user:manage')) return false;
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole];
}

/** A role may only ever assign a role strictly below its own. */
export function canAssignRole(actorRole: Role, roleToAssign: Role): boolean {
  if (!can(actorRole, 'user:manage')) return false;
  if (roleToAssign === 'SUPER_ADMIN') return false; // never grantable through the app
  return ROLE_RANK[actorRole] > ROLE_RANK[roleToAssign];
}

/**
 * Whether this user sees every lead in the org or only their own.
 *
 * SALES is restricted by default, but an org setting can open it up — small
 * teams often want everyone to see everything.
 */
export function seesAllLeads(role: Role, orgAllowsSalesToSeeAll: boolean): boolean {
  if (can(role, 'lead:view_all')) return true;
  return role === 'SALES' && orgAllowsSalesToSeeAll;
}
