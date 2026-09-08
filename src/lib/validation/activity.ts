import { z } from 'zod';
import {
  MANUAL_ACTIVITY_TYPES,
  ACTIVITY_DIRECTIONS,
  ACTIVITY_STATUSES,
  CALL_OUTCOMES,
  LOST_REASONS,
} from '@/lib/constants/enums';
import { optionalString, optionalDate, optionalNumber, optionalObjectId, objectIdSchema, paginationQuery } from './common';

/**
 * Logging an activity is where the CRM's core discipline rule lives: a call can
 * end in exactly one of two ways — a next follow-up is scheduled, or the lead is
 * explicitly closed with a reason. Anything else leaves a lead with no next
 * action, which is precisely how leads get forgotten.
 *
 * The rule is enforced here (server-side), not just in the UI.
 */
export const logActivitySchema = z
  .object({
    type: z.enum(MANUAL_ACTIVITY_TYPES as [string, ...string[]]),
    direction: z.enum(ACTIVITY_DIRECTIONS).optional(),
    outcome: z.enum(CALL_OUTCOMES).optional(),
    durationSeconds: optionalNumber(86400),
    subject: optionalString(250),
    body: optionalString(5000),
    scheduledAt: optionalDate,
    status: z.enum(ACTIVITY_STATUSES).default('COMPLETED'),
    assignedTo: optionalObjectId,
    location: z
      .object({
        line1: optionalString(250),
        area: optionalString(120),
        city: optionalString(120),
        pincode: optionalString(12),
        mapsLink: optionalString(600),
      })
      .partial()
      .optional(),

    // The mandatory "what happens next" half of the rule.
    nextFollowUpAt: optionalDate,
    nextFollowUpNote: optionalString(500),
    closeLead: z.boolean().optional(),
    lostReason: z.enum(LOST_REASONS).optional(),
    lostReasonDetail: optionalString(1000),
    markWon: z.boolean().optional(),
    dealValue: optionalNumber(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.closeLead && !data.lostReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lostReason'],
        message: 'Select a reason when closing this lead',
      });
    }
    // A scheduled site visit or meeting needs a date.
    if ((data.type === 'SITE_VISIT' || data.type === 'MEETING') && data.status === 'PENDING' && !data.scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledAt'],
        message: 'Choose a date and time for the visit',
      });
    }
  });

/** Reschedule / snooze an existing follow-up. */
export const rescheduleFollowUpSchema = z
  .object({
    nextFollowUpAt: z.union([z.string(), z.date()]),
    nextFollowUpNote: optionalString(500),
    reason: optionalString(500),
  })
  .strict()
  .transform((d) => ({
    ...d,
    nextFollowUpAt: d.nextFollowUpAt instanceof Date ? d.nextFollowUpAt : new Date(d.nextFollowUpAt),
  }))
  .refine((d) => !Number.isNaN(d.nextFollowUpAt.getTime()), {
    path: ['nextFollowUpAt'],
    message: 'Choose a valid date and time',
  });

/** Complete or cancel a scheduled activity (e.g. a site visit). */
export const completeActivitySchema = z
  .object({
    status: z.enum(['COMPLETED', 'CANCELLED', 'NO_SHOW']),
    body: optionalString(5000),
    nextFollowUpAt: optionalDate,
    nextFollowUpNote: optionalString(500),
  })
  .strict();

export const activityQuerySchema = paginationQuery.extend({
  leadId: objectIdSchema.optional(),
  type: optionalString(40),
  from: optionalString(10),
  to: optionalString(10),
});

/** Site-visit calendar / list query. */
export const siteVisitQuerySchema = paginationQuery.extend({
  status: z.enum(ACTIVITY_STATUSES).optional(),
  assignedTo: z.string().optional(),
  from: optionalString(10),
  to: optionalString(10),
});

export type LogActivityInput = z.infer<typeof logActivitySchema>;
export type RescheduleFollowUpInput = z.infer<typeof rescheduleFollowUpSchema>;
export type CompleteActivityInput = z.infer<typeof completeActivitySchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type SiteVisitQuery = z.infer<typeof siteVisitQuerySchema>;
