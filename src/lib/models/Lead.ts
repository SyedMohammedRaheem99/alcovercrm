import { Schema, model, models, type Model, type Document, type Types } from 'mongoose';
import {
  LEAD_STAGES,
  PRIORITIES,
  MATERIALS,
  PRODUCT_TYPES,
  GLASS_TYPES,
  LEAD_SOURCES,
  PROPERTY_TYPES,
  CONSTRUCTION_STAGES,
  TIMELINES,
  DECISION_MAKERS,
  LOST_REASONS,
  type LeadStage,
  type Priority,
  type Material,
  type ProductType,
  type GlassType,
  type LeadSource,
  type PropertyType,
  type ConstructionStage,
  type Timeline,
  type DecisionMaker,
  type LostReason,
} from '@/lib/constants/enums';
import { normalizePhone } from '@/lib/utils/phone';
import { computeLeadScore } from '@/lib/services/leadScore';

export interface ILeadAddress {
  line1?: string;
  area?: string;
  city?: string;
  state?: string;
  pincode?: string;
  landmark?: string;
}

export interface ILead extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  leadCode: string;

  // Identity
  name: string;
  phone: string;
  phoneNormalized: string;
  altPhone?: string;
  altPhoneNormalized?: string;
  email?: string;
  whatsappSameAsPhone: boolean;
  whatsappPhone?: string;

  // Location
  address: ILeadAddress;
  googleMapsLink?: string;

  // Requirement
  materials: Material[];
  productTypes: ProductType[];
  glassTypes: GlassType[];
  approxAreaSqft?: number;
  unitCount?: number;
  requirementNotes?: string;

  // Qualification
  propertyType?: PropertyType;
  constructionStage?: ConstructionStage;
  timeline?: Timeline;
  budgetMin?: number;
  budgetMax?: number;
  decisionMaker?: DecisionMaker;
  hasCompetitorQuote?: boolean;
  competitorNames: string[];

  // Pipeline
  stage: LeadStage;
  priority: Priority;
  score: number;
  scoreLocked: boolean;

  // Source
  source: LeadSource;
  sourceDetail?: string;
  referredByLeadId?: Types.ObjectId;
  campaignName?: string;

  // Assignment & timing
  assignedTo?: Types.ObjectId;
  assignedToName?: string;
  assignedAt?: Date;
  firstContactedAt?: Date;
  lastContactedAt?: Date;
  nextFollowUpAt?: Date;
  nextFollowUpNote?: string;
  contactAttempts: number;

  // Outcome
  wonAt?: Date;
  lostAt?: Date;
  dealValue?: number;
  lostReason?: LostReason;
  lostReasonDetail?: string;
  customerSince?: Date;

  // Meta
  tags: string[];
  notes?: string;
  importBatchId?: Types.ObjectId;
  isDuplicateOf?: Types.ObjectId;
  activityCount: number;
  quotationCount: number;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LeadAddressSchema = new Schema<ILeadAddress>(
  {
    line1: { type: String, trim: true, maxlength: 250 },
    area: { type: String, trim: true, maxlength: 120 },
    city: { type: String, trim: true, maxlength: 120 },
    state: { type: String, trim: true, maxlength: 120 },
    pincode: { type: String, trim: true, maxlength: 12 },
    landmark: { type: String, trim: true, maxlength: 200 },
  },
  { _id: false },
);

const LeadSchema = new Schema<ILead>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    leadCode: { type: String, required: true, trim: true, uppercase: true },

    /* -------------------------- Identity -------------------------- */
    name: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    phoneNormalized: { type: String, required: true, trim: true, index: true },
    altPhone: { type: String, trim: true, maxlength: 30 },
    altPhoneNormalized: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    whatsappSameAsPhone: { type: Boolean, default: true },
    whatsappPhone: { type: String, trim: true, maxlength: 30 },

    /* -------------------------- Location -------------------------- */
    address: { type: LeadAddressSchema, default: () => ({}) },
    googleMapsLink: { type: String, trim: true, maxlength: 600 },

    /* ------------------------- Requirement ------------------------ */
    materials: { type: [String], enum: MATERIALS, default: [] },
    productTypes: { type: [String], enum: PRODUCT_TYPES, default: [] },
    glassTypes: { type: [String], enum: GLASS_TYPES, default: [] },
    approxAreaSqft: { type: Number, min: 0, max: 1_000_000 },
    unitCount: { type: Number, min: 0, max: 100_000 },
    requirementNotes: { type: String, trim: true, maxlength: 4000 },

    /* ------------------------ Qualification ----------------------- */
    propertyType: { type: String, enum: PROPERTY_TYPES },
    constructionStage: { type: String, enum: CONSTRUCTION_STAGES },
    timeline: { type: String, enum: TIMELINES },
    budgetMin: { type: Number, min: 0 },
    budgetMax: { type: Number, min: 0 },
    decisionMaker: { type: String, enum: DECISION_MAKERS },
    hasCompetitorQuote: { type: Boolean },
    competitorNames: { type: [String], default: [] },

    /* -------------------------- Pipeline -------------------------- */
    stage: { type: String, enum: LEAD_STAGES, default: 'NEW', required: true },
    priority: { type: String, enum: PRIORITIES, default: 'WARM', required: true },
    score: { type: Number, default: 0, min: 0, max: 100 },
    /** Set when a human overrides the priority, so auto-scoring stops fighting them. */
    scoreLocked: { type: Boolean, default: false },

    /* --------------------------- Source --------------------------- */
    source: { type: String, enum: LEAD_SOURCES, default: 'OTHER', required: true },
    sourceDetail: { type: String, trim: true, maxlength: 250 },
    referredByLeadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
    campaignName: { type: String, trim: true, maxlength: 250 },

    /* -------------------- Assignment & timing --------------------- */
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    /** Denormalised so list views render without populating User on every row. */
    assignedToName: { type: String, trim: true },
    assignedAt: { type: Date },
    firstContactedAt: { type: Date },
    lastContactedAt: { type: Date },
    nextFollowUpAt: { type: Date, index: true },
    nextFollowUpNote: { type: String, trim: true, maxlength: 500 },
    contactAttempts: { type: Number, default: 0, min: 0 },

    /* -------------------------- Outcome --------------------------- */
    wonAt: { type: Date },
    lostAt: { type: Date },
    dealValue: { type: Number, min: 0 },
    lostReason: { type: String, enum: LOST_REASONS },
    lostReasonDetail: { type: String, trim: true, maxlength: 1000 },
    customerSince: { type: Date },

    /* ---------------------------- Meta ---------------------------- */
    tags: { type: [String], default: [] },
    notes: { type: String, trim: true, maxlength: 4000 },
    importBatchId: { type: Schema.Types.ObjectId, ref: 'ImportBatch', index: true },
    isDuplicateOf: { type: Schema.Types.ObjectId, ref: 'Lead' },
    activityCount: { type: Number, default: 0, min: 0 },
    quotationCount: { type: Number, default: 0, min: 0 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, strict: true },
);

/* ------------------------------ Indexes ------------------------------
 * Designed against the actual queries in Phase 3A, not guessed.
 * -------------------------------------------------------------------- */

// Duplicate prevention + instant phone lookup. Partial so soft-deleted leads
// do not block re-creating a lead with the same number.
LeadSchema.index(
  { organizationId: 1, phoneNormalized: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

// THE dashboard query: overdue / today's follow-ups.
LeadSchema.index({ organizationId: 1, isDeleted: 1, nextFollowUpAt: 1 });

// Pipeline board and stage-filtered lists.
LeadSchema.index({ organizationId: 1, isDeleted: 1, stage: 1, updatedAt: -1 });

// A salesperson's own follow-up queue.
LeadSchema.index({ organizationId: 1, isDeleted: 1, assignedTo: 1, nextFollowUpAt: 1 });

// Default list sort and "new leads today".
LeadSchema.index({ organizationId: 1, isDeleted: 1, createdAt: -1 });

// Source analytics.
LeadSchema.index({ organizationId: 1, isDeleted: 1, source: 1, createdAt: -1 });

// Uncontacted / SLA-breach detection.
LeadSchema.index({ organizationId: 1, isDeleted: 1, firstContactedAt: 1 });

// Human-readable code lookup.
LeadSchema.index({ organizationId: 1, leadCode: 1 }, { unique: true });

// Location analytics.
LeadSchema.index({ organizationId: 1, isDeleted: 1, 'address.city': 1 });
LeadSchema.index({ organizationId: 1, isDeleted: 1, 'address.area': 1 });

// Global search box.
LeadSchema.index(
  {
    name: 'text',
    phone: 'text',
    email: 'text',
    'address.area': 'text',
    'address.city': 'text',
    requirementNotes: 'text',
    leadCode: 'text',
  },
  {
    name: 'lead_text_search',
    weights: { name: 10, phone: 10, leadCode: 8, email: 4, 'address.area': 3, 'address.city': 3, requirementNotes: 1 },
  },
);

/* ------------------------------- Hooks -------------------------------- */

/**
 * Phone normalisation runs here rather than in the service layer so it can
 * never be bypassed — every write path goes through validation.
 */
LeadSchema.pre('validate', function () {
  if (this.phone) this.phoneNormalized = normalizePhone(this.phone);
  if (this.altPhone) this.altPhoneNormalized = normalizePhone(this.altPhone);
  else this.altPhoneNormalized = undefined;

  if (this.whatsappSameAsPhone) this.whatsappPhone = undefined;
});

/** Keep stage-derived timestamps consistent no matter which path set the stage. */
LeadSchema.pre('save', function () {
  if (this.isModified('stage')) {
    if (this.stage === 'WON') {
      this.wonAt = this.wonAt ?? new Date();
      this.customerSince = this.customerSince ?? this.wonAt;
      this.lostAt = undefined;
      // A won lead needs no further chasing.
      this.nextFollowUpAt = undefined;
      this.nextFollowUpNote = undefined;
    } else if (this.stage === 'LOST') {
      this.lostAt = this.lostAt ?? new Date();
      this.wonAt = undefined;
      this.nextFollowUpAt = undefined;
      this.nextFollowUpNote = undefined;
    } else {
      // Re-opened: clear the closure markers.
      this.wonAt = undefined;
      this.lostAt = undefined;
      this.lostReason = undefined;
      this.lostReasonDetail = undefined;
    }
  }

  // Recompute the score unless a human has pinned the priority.
  if (!this.scoreLocked) {
    const { score, priority } = computeLeadScore(this);
    this.score = score;
    this.priority = priority;
  }
});

export const Lead: Model<ILead> = (models.Lead as Model<ILead>) || model<ILead>('Lead', LeadSchema);

export default Lead;
