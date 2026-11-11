import { z } from 'zod';

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .email('Email address is invalid.')
  .max(254)
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter.')
  .regex(/[0-9]/, 'Password must contain at least one number.');

const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your email.');

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(120, 'Full name must be at most 120 characters.'),
  email: emailSchema,
  password: passwordSchema,
  // FR-AUTH-001 / FR-AUTH-002: direct student or teacher self-selection.
  role: z.enum(['student', 'teacher'], {
    errorMap: () => ({ message: 'Role must be student or teacher.' }),
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.').max(128),
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: codeSchema,
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: codeSchema,
  password: passwordSchema,
});

export const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters.')
      .max(120, 'Full name must be at most 120 characters.')
      .optional(),
    academicTimezone: z.string().trim().min(1).max(64).optional(),
    timeFormat: z.enum(['12h', '24h']).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update.',
  });
