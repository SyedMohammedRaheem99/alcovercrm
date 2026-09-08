import { Types } from 'mongoose';
import { AuditLog } from '@/lib/models';
import type { AuditAction } from '@/lib/constants/enums';

/**
 * Audit logging.
 *
 * Writes are fire-and-forget: an audit failure must never break the user's
 * actual operation, so errors are swallowed and logged to the server console
 * instead of propagating.
 */

export interface AuditContext {
  organizationId?: string | Types.ObjectId | null;
  userId?: string | Types.ObjectId | null;
  userName?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditEntry extends AuditContext {
  action: AuditAction;
  entityType?: string;
  entityId?: string | Types.ObjectId;
  entityLabel?: string;
  changes?: Record<string, { from?: unknown; to?: unknown }>;
  meta?: Record<string, unknown>;
  success?: boolean;
}

/** Fields that must never be written into an audit record. */
const REDACTED_KEYS = new Set(['password', 'passwordHash', 'newPassword', 'currentPassword', 'confirmPassword', 'token']);

function redact(changes?: Record<string, { from?: unknown; to?: unknown }>) {
  if (!changes) return undefined;
  const out: Record<string, { from?: unknown; to?: unknown }> = {};
  for (const [key, value] of Object.entries(changes)) {
    out[key] = REDACTED_KEYS.has(key) ? { from: '[redacted]', to: '[redacted]' } : value;
  }
  return out;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      organizationId: entry.organizationId ?? undefined,
      userId: entry.userId ?? undefined,
      userName: entry.userName,
      userEmail: entry.userEmail,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? undefined,
      entityLabel: entry.entityLabel,
      changes: redact(entry.changes),
      meta: entry.meta,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent?.slice(0, 400),
      success: entry.success ?? true,
    });
  } catch (err) {
    console.error('[AUDIT] failed to write entry', err);
  }
}

/**
 * Build a `{field: {from, to}}` diff, ignoring unchanged values.
 * Used so audit records store what actually changed rather than a whole document.
 */
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields?: string[],
): Record<string, { from?: unknown; to?: unknown }> {
  const keys = fields ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes: Record<string, { from?: unknown; to?: unknown }> = {};

  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    if (a === undefined && b === undefined) continue;

    const aVal = a instanceof Date ? a.toISOString() : a;
    const bVal = b instanceof Date ? b.toISOString() : b;

    if (JSON.stringify(aVal) !== JSON.stringify(bVal)) {
      changes[key] = { from: aVal, to: bVal };
    }
  }

  return changes;
}

/** Extract audit context from a request plus the current user. */
export function auditContextFrom(
  headers: Headers,
  user?: { id: string; organizationId: string | null; name: string; email: string } | null,
): AuditContext {
  return {
    organizationId: user?.organizationId ?? undefined,
    userId: user?.id,
    userName: user?.name,
    userEmail: user?.email,
    ipAddress: headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headers.get('x-real-ip') ?? undefined,
    userAgent: headers.get('user-agent') ?? undefined,
  };
}
