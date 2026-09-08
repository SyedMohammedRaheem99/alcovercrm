import { Schema, model, models, type Model, type Document, type Types } from 'mongoose';
import {
  QUOTATION_STATUSES,
  DISCOUNT_TYPES,
  MATERIALS,
  PRODUCT_TYPES,
  GLASS_TYPES,
  type QuotationStatus,
  type DiscountType,
  type Material,
  type ProductType,
  type GlassType,
} from '@/lib/constants/enums';

/**
 * Quotations are deliberately LIGHT in v1 — amount, validity, status, revisions.
 *
 * The `items[]` sub-schema is fully specified now even though the line-item
 * builder UI ships later, so adding that UI is purely additive and needs no
 * data migration.
 */

export interface IQuotationItem {
  description: string;
  material?: Material;
  productType?: ProductType;
  glassType?: GlassType;
  series?: string;
  widthMm?: number;
  heightMm?: number;
  quantity: number;
  areaSqft?: number;
  ratePerSqft?: number;
  unitRate?: number;
  amount: number;
  notes?: string;
}

export interface IQuotation extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  leadId: Types.ObjectId;
  quotationNumber: string;
  revision: number;
  parentQuotationId?: Types.ObjectId;
  status: QuotationStatus;
  title?: string;
  items: IQuotationItem[];
  subtotal: number;
  discount: number;
  discountType: DiscountType;
  taxPercent: number;
  taxAmount: number;
  grandTotal: number;
  validUntil?: Date;
  sentAt?: Date;
  respondedAt?: Date;
  notes?: string;
  termsAndConditions?: string;
  attachmentUrl?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdByName?: string;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const QuotationItemSchema = new Schema<IQuotationItem>(
  {
    description: { type: String, required: true, trim: true, maxlength: 500 },
    material: { type: String, enum: MATERIALS },
    productType: { type: String, enum: PRODUCT_TYPES },
    glassType: { type: String, enum: GLASS_TYPES },
    series: { type: String, trim: true, maxlength: 120 },
    widthMm: { type: Number, min: 0 },
    heightMm: { type: Number, min: 0 },
    quantity: { type: Number, default: 1, min: 0 },
    areaSqft: { type: Number, min: 0 },
    ratePerSqft: { type: Number, min: 0 },
    unitRate: { type: Number, min: 0 },
    amount: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true, maxlength: 500 },
  },
  { _id: true },
);

const QuotationSchema = new Schema<IQuotation>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    quotationNumber: { type: String, required: true, trim: true, uppercase: true },
    revision: { type: Number, default: 1, min: 1 },
    parentQuotationId: { type: Schema.Types.ObjectId, ref: 'Quotation' },
    status: { type: String, enum: QUOTATION_STATUSES, default: 'DRAFT', required: true },
    title: { type: String, trim: true, maxlength: 250 },
    items: { type: [QuotationItemSchema], default: [] },
    subtotal: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    discountType: { type: String, enum: DISCOUNT_TYPES, default: 'FLAT' },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxAmount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    validUntil: { type: Date },
    sentAt: { type: Date },
    respondedAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 4000 },
    termsAndConditions: { type: String, trim: true, maxlength: 8000 },
    /** Link to a PDF stored elsewhere — avoids paid blob storage in v1. */
    attachmentUrl: { type: String, trim: true, maxlength: 600 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, strict: true },
);

/* ------------------------------ Indexes ------------------------------ */
QuotationSchema.index({ organizationId: 1, leadId: 1, createdAt: -1 });
QuotationSchema.index({ organizationId: 1, quotationNumber: 1 }, { unique: true });
QuotationSchema.index({ organizationId: 1, status: 1, validUntil: 1 });

/* ------------------------------- Hooks -------------------------------- */

/**
 * Totals are always derived server-side. A client could otherwise post a
 * grandTotal that disagrees with its own line items.
 */
QuotationSchema.pre('save', function () {
  if (this.items && this.items.length > 0) {
    this.subtotal = this.items.reduce((sum, item) => sum + (item.amount || 0), 0);
  }

  const discountValue =
    this.discountType === 'PERCENT' ? (this.subtotal * (this.discount || 0)) / 100 : this.discount || 0;

  const afterDiscount = Math.max(0, this.subtotal - discountValue);
  this.taxAmount = (afterDiscount * (this.taxPercent || 0)) / 100;
  this.grandTotal = Math.round((afterDiscount + this.taxAmount) * 100) / 100;

  if (this.isModified('status') && this.status === 'SENT' && !this.sentAt) {
    this.sentAt = new Date();
  }
});

export const Quotation: Model<IQuotation> =
  (models.Quotation as Model<IQuotation>) || model<IQuotation>('Quotation', QuotationSchema);

export default Quotation;
