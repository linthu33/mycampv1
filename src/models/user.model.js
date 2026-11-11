import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * User model — FR-AUTH-001..010 and profile preferences.
 *
 * Design notes:
 * - `role` is immutable at the schema level AND ignored by every controller
 *   input (FR-AUTH-003 — server prevents client-side role changes).
 * - `email` is always stored lowercase so uniqueness is case-insensitive.
 * - `passwordHash`, verification/reset fields are `select: false` so they can
 *   never leak through a normal query.
 * - No password is ever stored in plain text.
 */
const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required.'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters.'],
      maxlength: [120, 'Full name must be at most 120 characters.'],
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email address is invalid.'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ['student', 'teacher'],
        message: 'Role must be student or teacher.',
      },
      required: [true, 'Role is required.'],
      // FR-AUTH-003: the registered role cannot be changed by any later write.
      immutable: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    // Hashed one-time codes (never stored in clear text).
    emailVerificationCodeHash: { type: String, select: false },
    emailVerificationSentAt: { type: Date, select: false },
    emailVerificationExpiresAt: { type: Date, select: false },
    passwordResetCodeHash: { type: String, select: false },
    passwordResetSentAt: { type: Date, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    // FR-PROFILE-001 (profile requirement, kept here as part of the account).
    academicTimezone: {
      type: String,
      default: 'Asia/Yangon',
      trim: true,
      maxlength: 64,
    },
    // FR-CAL-004: 12-hour (default) or 24-hour time display.
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '12h',
    },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.emailVerificationCodeHash;
        delete ret.emailVerificationSentAt;
        delete ret.emailVerificationExpiresAt;
        delete ret.passwordResetCodeHash;
        delete ret.passwordResetSentAt;
        delete ret.passwordResetExpiresAt;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// `unique: true` on the email field already creates the index.

/** Hash a plain-text password with bcrypt (cost 12). */
userSchema.statics.hashPassword = function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, 12);
};

/** Safe password comparison that never throws on malformed hashes. */
userSchema.methods.verifyPassword = function verifyPassword(plainPassword) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plainPassword, this.passwordHash);
};

export default mongoose.model('User', userSchema);
