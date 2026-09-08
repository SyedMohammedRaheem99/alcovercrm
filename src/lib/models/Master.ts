import { Schema, model, models, type Model, type Document, type Types } from 'mongoose';
import { MASTER_TYPES, type MasterType } from '@/lib/constants/enums';

/**
 * Tenant-configurable dropdown values (product types, sources, tags, WhatsApp
 * templates...). One flexible collection instead of eight tiny ones, so adding
 * a new configurable list later needs no new model or migration.
 *
 * `isSystem` rows ship with every organisation and can be hidden but never
 * deleted, so reports built on them never break.
 */

export interface IMaster extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  type: MasterType;
  key: string;
  label: string;
  value?: string;
  color?: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MasterSchema = new Schema<IMaster>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    type: { type: String, enum: MASTER_TYPES, required: true },
    key: { type: String, required: true, trim: true, maxlength: 80 },
    label: { type: String, required: true, trim: true, maxlength: 250 },
    /** For WHATSAPP_TEMPLATE this holds the message body with {{placeholders}}. */
    value: { type: String, trim: true, maxlength: 4000 },
    color: { type: String, trim: true, maxlength: 20 },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isSystem: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, strict: true },
);

MasterSchema.index({ organizationId: 1, type: 1, isActive: 1, sortOrder: 1 });
MasterSchema.index({ organizationId: 1, type: 1, key: 1 }, { unique: true });

export const Master: Model<IMaster> =
  (models.Master as Model<IMaster>) || model<IMaster>('Master', MasterSchema);

export default Master;
