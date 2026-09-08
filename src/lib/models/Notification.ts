import { Schema, model, models, type Model, type Document, type Types } from 'mongoose';
import { NOTIFICATION_TYPES, type NotificationType } from '@/lib/constants/enums';

/**
 * In-app notifications (bell icon). Deliberately not push/email — those need
 * paid services, and the dashboard already surfaces everything urgent.
 *
 * TTL-pruned after 90 days.
 */

export interface INotification extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  entityId?: Types.ObjectId;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 250 },
    body: { type: String, trim: true, maxlength: 1000 },
    link: { type: String, trim: true, maxlength: 500 },
    entityId: { type: Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strict: true },
);

NotificationSchema.index({ organizationId: 1, userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const Notification: Model<INotification> =
  (models.Notification as Model<INotification>) ||
  model<INotification>('Notification', NotificationSchema);

export default Notification;
