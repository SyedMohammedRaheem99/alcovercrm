import { Schema, model, models, type Model, type Document, type Types } from 'mongoose';
import {
  ACTIVITY_TYPES,
  ACTIVITY_DIRECTIONS,
  ACTIVITY_STATUSES,
  CALL_OUTCOMES,
  type ActivityType,
  type ActivityDirection,
  type ActivityStatus,
  type CallOutcome,
} from '@/lib/constants/enums';

/**
 * The immutable timeline. Every call, message, site visit, stage change and note
 * lands here, so a lead's full history is always reconstructable and the record
 * doubles as an audit trail of who did what.
 */

export interface IActivityLocation {
  line1?: string;
  area?: string;
  city?: string;
  pincode?: string;
  mapsLink?: string;
}

export interface IActivity extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  leadId: Types.ObjectId;
  type: ActivityType;
  direction?: ActivityDirection;
  outcome?: CallOutcome;
  durationSeconds?: number;
  subject?: string;
  body?: string;
  scheduledAt?: Date;
  completedAt?: Date;
  status: ActivityStatus;
  location?: IActivityLocation;
  assignedTo?: Types.ObjectId;
  assignedToName?: string;
  metadata?: Record<string, unknown>;
  performedBy?: Types.ObjectId;
  performedByName: string;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ActivityLocationSchema = new Schema<IActivityLocation>(
  {
    line1: { type: String, trim: true, maxlength: 250 },
    area: { type: String, trim: true, maxlength: 120 },
    city: { type: String, trim: true, maxlength: 120 },
    pincode: { type: String, trim: true, maxlength: 12 },
    mapsLink: { type: String, trim: true, maxlength: 600 },
  },
  { _id: false },
);

const ActivitySchema = new Schema<IActivity>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    direction: { type: String, enum: ACTIVITY_DIRECTIONS },
    outcome: { type: String, enum: CALL_OUTCOMES },
    durationSeconds: { type: Number, min: 0, max: 86400 },
    subject: { type: String, trim: true, maxlength: 250 },
    body: { type: String, trim: true, maxlength: 5000 },
    /** Set for future-dated work: site visits and meetings. */
    scheduledAt: { type: Date },
    completedAt: { type: Date },
    status: { type: String, enum: ACTIVITY_STATUSES, default: 'COMPLETED', required: true },
    location: { type: ActivityLocationSchema },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedToName: { type: String, trim: true },
    /** Free-form extras, e.g. { from: 'NEW', to: 'CONTACTED' } on a stage change. */
    metadata: { type: Schema.Types.Mixed },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    performedByName: { type: String, trim: true, default: 'System' },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, strict: true },
);

/* ------------------------------ Indexes ------------------------------ */

// The lead timeline — the hottest read path after the dashboard.
ActivitySchema.index({ organizationId: 1, leadId: 1, createdAt: -1 });

// Upcoming site visits / meetings.
ActivitySchema.index({ organizationId: 1, type: 1, scheduledAt: 1, status: 1 });

// Per-user activity reports.
ActivitySchema.index({ organizationId: 1, performedBy: 1, createdAt: -1 });

// Org-wide activity feed.
ActivitySchema.index({ organizationId: 1, createdAt: -1 });

/* ------------------------------- Hooks -------------------------------- */

ActivitySchema.pre('save', function () {
  // A completed activity always has a completion time.
  if (this.status === 'COMPLETED' && !this.completedAt) {
    this.completedAt = this.scheduledAt && this.scheduledAt > new Date() ? undefined : new Date();
    if (!this.completedAt) this.completedAt = new Date();
  }
});

export const Activity: Model<IActivity> =
  (models.Activity as Model<IActivity>) || model<IActivity>('Activity', ActivitySchema);

export default Activity;
