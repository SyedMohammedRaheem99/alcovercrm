import mongoose, { Schema, model, models, type Model, type Document, type Types } from 'mongoose';
import { ORG_PLANS, type OrgPlan } from '@/lib/constants/enums';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';

export interface IOrgSettings {
  businessHours: { start: string; end: string; workingDays: number[] };
  leadResponseSlaMinutes: number;
  followUpOverdueGraceHours: number;
  autoAssignEnabled: boolean;
  requireNextActionOnCall: boolean;
  salesSeeAllLeads: boolean;
  defaultLeadStage: string;
  whatsappCountryCode: string;
  quotationValidityDays: number;
  financialYearStartMonth: number;
  leadCodePrefix: string;
}

export interface IOrganization extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  logoUrl?: string;
  phone?: string;
  email?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  gstin?: string;
  currency: string;
  timezone: string;
  plan: OrgPlan;
  isActive: boolean;
  settings: IOrgSettings;
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
  },
  { _id: false },
);

const SettingsSchema = new Schema<IOrgSettings>(
  {
    businessHours: {
      start: { type: String, default: '09:30' },
      end: { type: String, default: '19:00' },
      // 1 = Monday ... 7 = Sunday. Default Mon-Sat (typical for Indian factories).
      workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] },
    },
    /** Minutes allowed before an uncontacted lead is flagged as an SLA breach. */
    leadResponseSlaMinutes: { type: Number, default: 30, min: 1, max: 1440 },
    followUpOverdueGraceHours: { type: Number, default: 0, min: 0, max: 72 },
    autoAssignEnabled: { type: Boolean, default: false },
    /** The core discipline rule: a call must end with a next action or a close reason. */
    requireNextActionOnCall: { type: Boolean, default: true },
    salesSeeAllLeads: { type: Boolean, default: false },
    defaultLeadStage: { type: String, default: 'NEW' },
    whatsappCountryCode: { type: String, default: '91' },
    quotationValidityDays: { type: Number, default: 15, min: 1, max: 365 },
    financialYearStartMonth: { type: Number, default: 4, min: 1, max: 12 },
    leadCodePrefix: { type: String, default: 'LD', trim: true, uppercase: true },
  },
  { _id: false },
);

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    logoUrl: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: AddressSchema, default: {} },
    gstin: { type: String, trim: true, uppercase: true },
    currency: { type: String, default: 'INR', trim: true, uppercase: true },
    timezone: { type: String, default: DEFAULT_TIMEZONE, trim: true },
    plan: { type: String, enum: ORG_PLANS, default: 'FREE' },
    isActive: { type: Boolean, default: true },
    settings: { type: SettingsSchema, default: () => ({}) },
  },
  { timestamps: true, strict: true },
);

export const Organization: Model<IOrganization> =
  (models.Organization as Model<IOrganization>) ||
  model<IOrganization>('Organization', OrganizationSchema);

export default Organization;
