import { z } from 'zod';
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
  FOLLOW_UP_BUCKETS,
} from '@/lib/constants/enums';
import {
  nonEmptyString,
  optionalString,
  optionalEmail,
  phoneSchema,
  optionalPhone,
  optionalNumber,
  optionalDate,
  objectIdSchema,
  optionalObjectId,
  paginationQuery,
  csvArray,
  tagsSchema,
} from './common';

const addressSchema = z
  .object({
    line1: optionalString(250),
    area: optionalString(120),
    city: optionalString(120),
    state: optionalString(120),
    pincode: optionalString(12),
    landmark: optionalString(200),
  })
  .partial()
  .optional();

/**
 * Quick Add — the mobile 10-second path. Only name, phone and source are
 * required; everything else is optional so a salesperson standing at a site can
 * capture a lead before the moment passes.
 */
export const quickAddLeadSchema = z
  .object({
    name: nonEmptyString(160, 'Name'),
    phone: phoneSchema,
    source: z.enum(LEAD_SOURCES).default('OTHER'),
    sourceDetail: optionalString(250),
    city: optionalString(120),
    area: optionalString(120),
    materials: z.array(z.enum(MATERIALS)).max(6).optional(),
    productTypes: z.array(z.enum(PRODUCT_TYPES)).max(26).optional(),
    requirementNotes: optionalString(4000),
    assignedTo: optionalObjectId,
    nextFollowUpAt: optionalDate,
    nextFollowUpNote: optionalString(500),
  })
  .strict();

/** Full create/edit form. */
export const leadInputSchema = z
  .object({
    // Identity
    name: nonEmptyString(160, 'Name'),
    phone: phoneSchema,
    altPhone: optionalPhone,
    email: optionalEmail,
    whatsappSameAsPhone: z.boolean().default(true),
    whatsappPhone: optionalPhone,

    // Location
    address: addressSchema,
    googleMapsLink: optionalString(600),

    // Requirement
    materials: z.array(z.enum(MATERIALS)).max(6).default([]),
    productTypes: z.array(z.enum(PRODUCT_TYPES)).max(26).default([]),
    glassTypes: z.array(z.enum(GLASS_TYPES)).max(10).default([]),
    approxAreaSqft: optionalNumber(1_000_000),
    unitCount: optionalNumber(100_000),
    requirementNotes: optionalString(4000),

    // Qualification
    propertyType: z.enum(PROPERTY_TYPES).optional(),
    constructionStage: z.enum(CONSTRUCTION_STAGES).optional(),
    timeline: z.enum(TIMELINES).optional(),
    budgetMin: optionalNumber(),
    budgetMax: optionalNumber(),
    decisionMaker: z.enum(DECISION_MAKERS).optional(),
    hasCompetitorQuote: z.boolean().optional(),
    competitorNames: z.array(z.string().trim().max(120)).max(10).default([]),

    // Pipeline
    stage: z.enum(LEAD_STAGES).default('NEW'),
    priority: z.enum(PRIORITIES).optional(),
    scoreLocked: z.boolean().optional(),

    // Source
    source: z.enum(LEAD_SOURCES).default('OTHER'),
    sourceDetail: optionalString(250),
    referredByLeadId: optionalObjectId,
    campaignName: optionalString(250),

    // Assignment & follow-up
    assignedTo: optionalObjectId,
    nextFollowUpAt: optionalDate,
    nextFollowUpNote: optionalString(500),

    // Outcome
    dealValue: optionalNumber(),
    lostReason: z.enum(LOST_REASONS).optional(),
    lostReasonDetail: optionalString(1000),

    // Meta
    tags: tagsSchema,
    notes: optionalString(4000),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.budgetMin !== undefined && data.budgetMax !== undefined && data.budgetMin > data.budgetMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['budgetMax'],
        message: 'Maximum budget cannot be less than the minimum',
      });
    }
    // Closing a lead must always record why — otherwise ad spend cannot be optimised.
    if (data.stage === 'LOST' && !data.lostReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lostReason'],
        message: 'Select a reason when marking a lead as lost',
      });
    }
    if (!data.whatsappSameAsPhone && !data.whatsappPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['whatsappPhone'],
        message: 'Enter the WhatsApp number or tick "same as phone"',
      });
    }
  });

/** Partial update — every field optional, but the same cross-field rules apply. */
export const leadUpdateSchema = leadInputSchema.innerType().partial().strict().superRefine((data, ctx) => {
  if (data.budgetMin !== undefined && data.budgetMax !== undefined && data.budgetMin > data.budgetMax) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['budgetMax'],
      message: 'Maximum budget cannot be less than the minimum',
    });
  }
  if (data.stage === 'LOST' && data.lostReason === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['lostReason'],
      message: 'Select a reason when marking a lead as lost',
    });
  }
});

/** Stage change from the pipeline board or the detail header. */
export const stageChangeSchema = z
  .object({
    stage: z.enum(LEAD_STAGES),
    lostReason: z.enum(LOST_REASONS).optional(),
    lostReasonDetail: optionalString(1000),
    dealValue: optionalNumber(),
    note: optionalString(1000),
    nextFollowUpAt: optionalDate,
    nextFollowUpNote: optionalString(500),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.stage === 'LOST' && !data.lostReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lostReason'],
        message: 'Select a reason when marking a lead as lost',
      });
    }
  });

/** List/search query for the leads table. */
export const leadQuerySchema = paginationQuery.extend({
  q: optionalString(200),
  stage: csvArray(LEAD_STAGES),
  priority: csvArray(PRIORITIES),
  source: csvArray(LEAD_SOURCES),
  material: csvArray(MATERIALS),
  productType: csvArray(PRODUCT_TYPES),
  propertyType: csvArray(PROPERTY_TYPES),
  timeline: csvArray(TIMELINES),
  followUp: z.enum(FOLLOW_UP_BUCKETS).optional(),
  assignedTo: z.string().optional(), // 'me' | 'unassigned' | ObjectId
  city: optionalString(120),
  area: optionalString(120),
  tag: optionalString(60),
  from: optionalString(10),
  to: optionalString(10),
  uncontacted: z.enum(['true', 'false']).optional(),
  slaBreached: z.enum(['true', 'false']).optional(),
  includeDeleted: z.enum(['true', 'false']).optional(),
  sort: z
    .enum(['createdAt', '-createdAt', 'updatedAt', '-updatedAt', 'nextFollowUpAt', '-nextFollowUpAt', 'score', '-score', 'name', '-name'])
    .default('-createdAt'),
});

/** Bulk actions from the list view. */
export const bulkActionSchema = z
  .object({
    leadIds: z.array(objectIdSchema).min(1, 'Select at least one lead').max(500),
    action: z.enum(['ASSIGN', 'STAGE', 'TAG', 'UNTAG', 'DELETE', 'RESTORE', 'PRIORITY']),
    assignedTo: optionalObjectId,
    stage: z.enum(LEAD_STAGES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    tag: optionalString(60),
    lostReason: z.enum(LOST_REASONS).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.action === 'ASSIGN' && !data.assignedTo) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['assignedTo'], message: 'Choose a team member' });
    }
    if (data.action === 'STAGE' && !data.stage) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stage'], message: 'Choose a stage' });
    }
    if (data.action === 'STAGE' && data.stage === 'LOST' && !data.lostReason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lostReason'], message: 'Select a lost reason' });
    }
    if (data.action === 'PRIORITY' && !data.priority) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['priority'], message: 'Choose a priority' });
    }
    if ((data.action === 'TAG' || data.action === 'UNTAG') && !data.tag) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tag'], message: 'Enter a tag' });
    }
  });

export type QuickAddLeadInput = z.infer<typeof quickAddLeadSchema>;
export type LeadInput = z.infer<typeof leadInputSchema>;
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;
export type StageChangeInput = z.infer<typeof stageChangeSchema>;
export type LeadQuery = z.infer<typeof leadQuerySchema>;
export type BulkActionInput = z.infer<typeof bulkActionSchema>;
