import { Schema, model, models, type Model, type Document, type Types } from 'mongoose';
import { AUDIT_ACTIONS, type AuditAction } from '@/lib/constants/enums';

/**
 * Security and accountability trail for sensitive actions: logins, deletes,
 * exports, role changes, settings changes.
 *
 * A TTL index prunes entries after a year, which keeps the Atlas free tier from
 * filling up with log data while still covering any realistic dispute window.
 */

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  organizationId?: Types.ObjectId;
  userId?: Types.ObjectId;
  userName?: string;
  userEmail?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: Types.ObjectId;
  entityLabel?: string;
  changes?: Record<string, { from?: unknown; to?: unknown }>;
  meta?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String, trim: true },
    userEmail: { type: String, trim: true, lowercase: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entityType: { type: String, trim: true, maxlength: 60 },
    entityId: { type: Schema.Types.ObjectId },
    /** Human-readable label so the log stays meaningful after the row is deleted. */
    entityLabel: { type: String, trim: true, maxlength: 250 },
    changes: { type: Schema.Types.Mixed },
    meta: { type: Schema.Types.Mixed },
    ipAddress: { type: String, trim: true, maxlength: 60 },
    userAgent: { type: String, trim: true, maxlength: 400 },
    success: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strict: true },
);

AuditLogSchema.index({ organizationId: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, action: 1, createdAt: -1 });

// Auto-prune after 365 days.
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const AuditLog: Model<IAuditLog> =
  (models.AuditLog as Model<IAuditLog>) || model<IAuditLog>('AuditLog', AuditLogSchema);

export default AuditLog;
