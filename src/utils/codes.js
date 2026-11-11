import crypto from 'node:crypto';
import env from '../config/env.js';

export const CODE_TTL_MINUTES = 15;

export function generateNumericCode(digits = 6) {
  const max = 10 ** digits;
  return String(crypto.randomInt(0, max)).padStart(digits, '0');
}

/**
 * Codes are stored as HMAC-SHA256(email:code) so a database leak does not
 * expose usable verification/reset codes.
 */
export function hashCode(email, code) {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update(`${email.toLowerCase()}:${code}`)
    .digest('hex');
}

export function codeMatches(storedHash, email, code) {
  if (!storedHash || !code) return false;
  const candidate = Buffer.from(hashCode(email, code), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  if (candidate.length !== stored.length) return false;
  return crypto.timingSafeEqual(candidate, stored);
}

export function expiryFromNow(minutes = CODE_TTL_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000);
}
