'use strict';

import User from '../models/user.model.js';
import { signToken } from '../utils/jwt.js';
import {
  generateNumericCode,
  hashCode,
  codeMatches,
  expiryFromNow,
} from '../utils/codes.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  devCode,
} from '../services/email.service.js';

/**
 * Auth controller — implements FR-AUTH-001 .. FR-AUTH-010.
 *
 * Every response that includes a user uses User#toJSON, which strips hashes
 * and secrets. The role is never accepted from update endpoints.
 */

function isValidIanaTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch (_err) {
    return false;
  }
}

async function issueVerificationCode(user) {
  const code = generateNumericCode(6);
  user.emailVerificationCodeHash = hashCode(user.email, code);
  user.emailVerificationSentAt = new Date();
  user.emailVerificationExpiresAt = expiryFromNow();
  await user.save();
  await sendVerificationEmail(user, code);
  return code;
}

async function issuePasswordResetCode(user) {
  const code = generateNumericCode(6);
  user.passwordResetCodeHash = hashCode(user.email, code);
  user.passwordResetSentAt = new Date();
  user.passwordResetExpiresAt = expiryFromNow();
  await user.save();
  await sendPasswordResetEmail(user, code);
  return code;
}

/**
 * FR-AUTH-001 / FR-AUTH-002 / FR-AUTH-003
 * POST /api/auth/register
 * Body: { fullName, email, password, role }
 */
async function register(req, res) {
  const { fullName, email, password, role } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.emailVerified) {
      return res.status(409).json({
        code: 'EMAIL_IN_USE',
        message: 'An account with this email already exists. Sign in instead.',
      });
    }
    // Repeat registration of an unverified account: re-issue the code.
    // The original role stays untouched (role is immutable).
    const code = await issueVerificationCode(existing);
    return res.status(200).json({
      code: 'VERIFICATION_RESENT',
      message: 'This email is pending verification. We sent a new code.',
      email: existing.email,
      devCode: devCode(code),
    });
  }

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    fullName,
    email,
    passwordHash,
    role,
    emailVerified: false,
  });

  const code = await issueVerificationCode(user);

  return res.status(201).json({
    code: 'REGISTERED',
    message: 'Registration successful. Check your email for the 6-digit verification code.',
    email: user.email,
    // Development convenience only; undefined in production.
    devCode: devCode(code),
  });
}

/**
 * FR-AUTH-001 / FR-AUTH-006
 * POST /api/auth/verify-email
 * Body: { email, code }
 * Verifies the email and opens a session immediately.
 */
async function verifyEmail(req, res) {
  const { email, code } = req.body;

  const user = await User.findOne({ email }).select(
    '+emailVerificationCodeHash +emailVerificationExpiresAt',
  );

  if (!user) {
    return res.status(400).json({
      code: 'INVALID_VERIFICATION',
      message: 'Verification failed. Check the email and code.',
    });
  }

  if (user.emailVerified) {
    return res.status(409).json({
      code: 'ALREADY_VERIFIED',
      message: 'This email is already verified. Please sign in.',
    });
  }

  if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
    return res.status(400).json({
      code: 'CODE_EXPIRED',
      message: 'The verification code has expired. Request a new one.',
      email: user.email,
    });
  }

  if (!codeMatches(user.emailVerificationCodeHash, user.email, code)) {
    return res.status(400).json({
      code: 'INVALID_CODE',
      message: 'The verification code is incorrect.',
    });
  }

  user.emailVerified = true;
  user.emailVerificationCodeHash = undefined;
  user.emailVerificationSentAt = undefined;
  user.emailVerificationExpiresAt = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  return res.json({
    message: 'Email verified. Welcome to MyCampus!',
    token: signToken(user),
    user: user.toJSON(),
  });
}

/**
 * POST /api/auth/resend-verification
 * Body: { email }
 */
async function resendVerification(req, res) {
  const { email } = req.body;
  const user = await User.findOne({ email });

  // Same response whether or not the account exists (no account enumeration).
  if (!user || user.emailVerified) {
    return res.json({
      message: 'If this account needs verification, a new code has been sent.',
    });
  }

  const code = await issueVerificationCode(user);
  return res.json({
    message: 'A new verification code has been sent.',
    email: user.email,
    devCode: devCode(code),
  });
}

/**
 * FR-AUTH-004 / FR-AUTH-006
 * POST /api/auth/login
 * Body: { email, password }
 */
async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user) {
    return res.status(401).json({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
    });
  }

  const valid = await user.verifyPassword(password);
  if (!valid) {
    return res.status(401).json({
      code: 'INVALID_CREDENTIALS',
      message: 'Email or password is incorrect.',
    });
  }

  if (!user.emailVerified) {
    return res.status(403).json({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email before signing in.',
      email: user.email,
    });
  }

  user.lastLoginAt = new Date();
  await user.save();

  return res.json({
    message: 'Signed in successfully.',
    token: signToken(user),
    user: user.toJSON(),
  });
}

/**
 * FR-AUTH-007 / FR-AUTH-009
 * GET /api/auth/me
 * Revalidation endpoint: returns the current server-side profile and role.
 */
async function me(req, res) {
  return res.json({ user: req.user.toJSON() });
}

/**
 * FR-AUTH-007 / FR-PROFILE-001 / FR-CAL-004
 * PATCH /api/auth/profile
 * Body: { fullName?, academicTimezone?, timeFormat? }
 * Email and role are read-only in the MVP.
 */
async function updateProfile(req, res) {
  const { fullName, academicTimezone, timeFormat } = req.body;

  if (academicTimezone !== undefined && !isValidIanaTimeZone(academicTimezone)) {
    return res.status(400).json({
      code: 'INVALID_TIMEZONE',
      message: 'Academic timezone must be a valid IANA name, e.g. Asia/Yangon.',
    });
  }

  if (fullName !== undefined) req.user.fullName = fullName;
  if (academicTimezone !== undefined) req.user.academicTimezone = academicTimezone;
  if (timeFormat !== undefined) req.user.timeFormat = timeFormat;

  await req.user.save();
  return res.json({ message: 'Profile updated.', user: req.user.toJSON() });
}

/**
 * FR-AUTH-005
 * POST /api/auth/forgot-password
 * Body: { email }
 */
async function forgotPassword(req, res) {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (user) {
    const code = await issuePasswordResetCode(user);
    return res.json({
      message: 'If the account exists, a reset code has been sent.',
      email: user.email,
      devCode: devCode(code),
    });
  }

  // Do not reveal whether the email is registered.
  return res.json({ message: 'If the account exists, a reset code has been sent.' });
}

/**
 * FR-AUTH-005
 * POST /api/auth/reset-password
 * Body: { email, code, password }
 */
async function resetPassword(req, res) {
  const { email, code, password } = req.body;

  const user = await User.findOne({ email }).select(
    '+passwordResetCodeHash +passwordResetExpiresAt',
  );

  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    return res.status(400).json({
      code: 'RESET_EXPIRED',
      message: 'The reset code is invalid or has expired. Request a new one.',
    });
  }

  if (!codeMatches(user.passwordResetCodeHash, user.email, code)) {
    return res.status(400).json({
      code: 'INVALID_CODE',
      message: 'The reset code is incorrect.',
    });
  }

  user.passwordHash = await User.hashPassword(password);
  user.passwordResetCodeHash = undefined;
  user.passwordResetSentAt = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();

  return res.json({
    message: 'Password updated. You can sign in with the new password.',
  });
}

/**
 * FR-AUTH-010 — server side of safe logout.
 * JWTs are stateless; the client discards the token. This endpoint exists so
 * the client can confirm the action and so a revocation list can be added
 * later without changing the app contract.
 */
async function logout(_req, res) {
  return res.status(204).send();
}

export {
  register,
  verifyEmail,
  resendVerification,
  login,
  me,
  updateProfile,
  forgotPassword,
  resetPassword,
  logout,
};
