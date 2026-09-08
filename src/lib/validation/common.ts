import { z } from 'zod';
import { isPlausiblePhone } from '@/lib/utils/phone';

/**
 * Shared Zod primitives.
 *
 * Every API boundary validates through Zod before anything reaches Mongoose.
 * `.strict()` on request bodies rejects unknown keys, which is what stops a
 * client from smuggling in fields like `role` or `organizationId`.
 */

/** A 24-character hex MongoDB ObjectId. */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const optionalObjectId = objectIdSchema.optional().or(z.literal('')).transform((v) => (v ? v : undefined));

/** Trimmed non-empty string with a max length. */
export const nonEmptyString = (max = 250, field = 'This field') =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .max(max, `${field} must be ${max} characters or fewer`);

/** Optional trimmed string that becomes `undefined` when blank. */
export const optionalString = (max = 250) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(200);

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .optional()
  .transform((v) => (v === '' ? undefined : v))
  .refine((v) => v === undefined || z.string().email().safeParse(v).success, {
    message: 'Enter a valid email address',
  });

export const phoneSchema = z
  .string()
  .trim()
  .min(1, 'Phone number is required')
  .max(30)
  .refine((v) => isPlausiblePhone(v), { message: 'Enter a valid phone number' });

export const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .optional()
  .transform((v) => (v === '' ? undefined : v))
  .refine((v) => v === undefined || isPlausiblePhone(v), {
    message: 'Enter a valid phone number',
  });

/**
 * Password policy. Deliberately usable rather than maximal: length carries most
 * of the strength, and an over-strict rule pushes non-technical factory staff
 * towards writing passwords on a notepad.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .refine((v) => /[a-zA-Z]/.test(v), { message: 'Password must contain a letter' })
  .refine((v) => /[0-9]/.test(v), { message: 'Password must contain a number' });

/** Coerce a query-string number safely (`?page=2`). */
export const numericQuery = (min: number, max: number, fallback: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
    });

/** Optional non-negative money/amount value from a form or query string. */
export const optionalNumber = (max = 1_000_000_000) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '' || v === null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : undefined;
    });

/** Optional date from an ISO string or Date. */
export const optionalDate = z
  .union([z.string(), z.date()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  });

/** `?from=2026-01-01&to=2026-01-31` */
export const dateRangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

/** Standard pagination for every list endpoint. */
export const paginationQuery = z.object({
  page: numericQuery(1, 100000, 1),
  limit: numericQuery(1, 200, 25),
});

/** Accepts a repeated query param or a comma-separated list. */
export const csvArray = <T extends string>(allowed: readonly T[]) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v): T[] => {
      if (!v) return [];
      const raw = Array.isArray(v) ? v : v.split(',');
      return raw
        .map((s) => s.trim())
        .filter((s): s is T => (allowed as readonly string[]).includes(s));
    });

/** Free-form tag list, de-duplicated and capped. */
export const tagsSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v): string[] => {
    if (!v) return [];
    const raw = Array.isArray(v) ? v : v.split(',');
    const cleaned = raw.map((s) => s.trim()).filter(Boolean).slice(0, 25);
    return Array.from(new Set(cleaned));
  });
