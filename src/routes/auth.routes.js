import express from 'express';
import rateLimit from 'express-rate-limit';

import * as controller from '../controllers/auth.controller.js';
import validate from '../middlewares/validate.middleware.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/auth.schema.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

// Basic brute-force protection on credential endpoints.
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again later.' },
});

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests. Try again later.' },
});

// Public — registration and verification (FR-AUTH-001, 002, 005, 006)
router.post('/register', emailLimiter, validate(registerSchema), asyncHandler(controller.register));
router.post('/verify-email', authLimiter, validate(verifyEmailSchema), asyncHandler(controller.verifyEmail));
router.post(
  '/resend-verification',
  emailLimiter,
  validate(resendVerificationSchema),
  asyncHandler(controller.resendVerification),
);
router.post('/login', authLimiter, validate(loginSchema), asyncHandler(controller.login));
router.post(
  '/forgot-password',
  emailLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(controller.forgotPassword),
);
router.post(
  '/reset-password',
  emailLimiter,
  validate(resetPasswordSchema),
  asyncHandler(controller.resetPassword),
);

// Protected — verified email required (FR-AUTH-006, 007, 009, 010)
router.get('/me', requireAuth, asyncHandler(controller.me));
router.patch('/profile', requireAuth, validate(updateProfileSchema), asyncHandler(controller.updateProfile));
router.post('/logout', requireAuth, asyncHandler(controller.logout));

export default router;
