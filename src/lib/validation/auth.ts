import { z } from 'zod';
import { ROLES } from '@/lib/constants/enums';
import { emailSchema, passwordSchema, nonEmptyString, optionalPhone, optionalNumber, objectIdSchema } from './common';

export const loginSchema = z
  .object({
    email: emailSchema,
    // Not `passwordSchema` — login must accept whatever was set previously, and
    // echoing policy rules on a failed login leaks nothing useful anyway.
    password: z.string().min(1, 'Password is required').max(128),
    rememberMe: z.boolean().optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .strict()
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current one',
  });

/** Admin creating a team member. */
export const createUserSchema = z
  .object({
    name: nonEmptyString(120, 'Name'),
    email: emailSchema,
    phone: optionalPhone,
    password: passwordSchema,
    // SUPER_ADMIN is deliberately absent: it can never be granted through the app UI.
    role: z.enum(ROLES.filter((r) => r !== 'SUPER_ADMIN') as [string, ...string[]]),
    monthlyLeadTarget: optionalNumber(100000),
    monthlyRevenueTarget: optionalNumber(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    name: nonEmptyString(120, 'Name').optional(),
    phone: optionalPhone,
    role: z.enum(ROLES.filter((r) => r !== 'SUPER_ADMIN') as [string, ...string[]]).optional(),
    isActive: z.boolean().optional(),
    monthlyLeadTarget: optionalNumber(100000),
    monthlyRevenueTarget: optionalNumber(),
  })
  .strict();

/** Admin resetting another user's password (no current password needed). */
export const resetPasswordSchema = z
  .object({
    userId: objectIdSchema,
    newPassword: passwordSchema,
  })
  .strict();

export const updateProfileSchema = z
  .object({
    name: nonEmptyString(120, 'Name').optional(),
    phone: optionalPhone,
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
