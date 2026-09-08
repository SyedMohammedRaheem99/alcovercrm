import { Schema, model, models, type Model, type Document, type Types } from 'mongoose';
import { ROLES, type Role } from '@/lib/constants/enums';

export interface IUser extends Document {
  _id: Types.ObjectId;
  organizationId?: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  /** bcrypt hash — `select: false`, so it never leaves the server by accident. */
  passwordHash: string;
  role: Role;
  avatarColor: string;
  isActive: boolean;
  lastLoginAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  passwordChangedAt?: Date;
  targets?: { monthlyLeadTarget?: number; monthlyRevenueTarget?: number };
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** Deterministic avatar colours so a user keeps the same colour everywhere. */
export const AVATAR_COLORS = [
  '#1E3A8A', '#0EA5E9', '#6366F1', '#8B5CF6', '#A855F7',
  '#059669', '#F59E0B', '#F97316', '#DC2626', '#475569',
];

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const UserSchema = new Schema<IUser>(
  {
    // Null only for SUPER_ADMIN, who exists above any single tenant.
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: 'SALES' },
    avatarColor: { type: String, default: '#1E3A8A' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    passwordChangedAt: { type: Date },
    targets: {
      monthlyLeadTarget: { type: Number, min: 0 },
      monthlyRevenueTarget: { type: Number, min: 0 },
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, strict: true },
);

/* ------------------------------ Indexes ------------------------------ */
UserSchema.index({ organizationId: 1, isDeleted: 1, isActive: 1 });
UserSchema.index({ organizationId: 1, role: 1 });

/* ------------------------------ Hooks -------------------------------- */
UserSchema.pre('save', function () {
  if (this.isNew && (!this.avatarColor || this.avatarColor === '#1E3A8A')) {
    this.avatarColor = pickAvatarColor(this.email || this.name || 'user');
  }
});

/** Never leak the hash, even if a caller explicitly selected it. */
UserSchema.set('toJSON', {
  transform(_doc, ret) {
    delete (ret as { passwordHash?: unknown }).passwordHash;
    return ret;
  },
});

export const User: Model<IUser> = (models.User as Model<IUser>) || model<IUser>('User', UserSchema);

export default User;
