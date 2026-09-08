import { z } from 'zod';
import { MASTER_TYPES, LEAD_STAGES, DUPLICATE_STRATEGIES } from '@/lib/constants/enums';
import { nonEmptyString, optionalString, optionalEmail, optionalPhone, objectIdSchema } from './common';

export const orgProfileSchema = z
  .object({
    name: nonEmptyString(160, 'Business name').optional(),
    phone: optionalPhone,
    email: optionalEmail,
    gstin: optionalString(20),
    logoUrl: optionalString(600),
    address: z
      .object({
        line1: optionalString(250),
        line2: optionalString(250),
        city: optionalString(120),
        state: optionalString(120),
        pincode: optionalString(12),
      })
      .partial()
      .optional(),
  })
  .strict();

export const orgSettingsSchema = z
  .object({
    businessHours: z
      .object({
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'),
        workingDays: z.array(z.number().int().min(1).max(7)).max(7),
      })
      .partial()
      .optional(),
    leadResponseSlaMinutes: z.number().int().min(1).max(1440).optional(),
    followUpOverdueGraceHours: z.number().int().min(0).max(72).optional(),
    requireNextActionOnCall: z.boolean().optional(),
    salesSeeAllLeads: z.boolean().optional(),
    autoAssignEnabled: z.boolean().optional(),
    defaultLeadStage: z.enum(LEAD_STAGES).optional(),
    whatsappCountryCode: z.string().regex(/^\d{1,4}$/).optional(),
    quotationValidityDays: z.number().int().min(1).max(365).optional(),
    financialYearStartMonth: z.number().int().min(1).max(12).optional(),
    leadCodePrefix: z.string().trim().min(1).max(6).regex(/^[A-Za-z]+$/, 'Letters only').optional(),
  })
  .strict();

export const masterInputSchema = z
  .object({
    type: z.enum(MASTER_TYPES),
    key: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens or underscores'),
    label: nonEmptyString(250, 'Label'),
    value: optionalString(4000),
    color: optionalString(20),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const masterUpdateSchema = masterInputSchema.partial().omit({ type: true, key: true }).strict();

/** CSV/Excel import configuration. */
export const importConfigSchema = z
  .object({
    // Uploaded column header -> lead field name.
    mapping: z.record(z.string().max(200), z.string().max(80)),
    duplicateStrategy: z.enum(DUPLICATE_STRATEGIES).default('SKIP'),
    defaults: z
      .object({
        source: optionalString(40),
        sourceDetail: optionalString(250),
        campaignName: optionalString(250),
        assignedTo: z.string().optional(),
        city: optionalString(120),
        stage: z.enum(LEAD_STAGES).optional(),
      })
      .partial()
      .optional(),
  })
  .strict();

export const exportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx']).default('csv'),
  scope: z.enum(['filtered', 'all']).default('filtered'),
});

export const backupQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

export const rollbackImportSchema = z.object({ batchId: objectIdSchema }).strict();

export type OrgProfileInput = z.infer<typeof orgProfileSchema>;
export type OrgSettingsInput = z.infer<typeof orgSettingsSchema>;
export type MasterInput = z.infer<typeof masterInputSchema>;
export type ImportConfigInput = z.infer<typeof importConfigSchema>;
