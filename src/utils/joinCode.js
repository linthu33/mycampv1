import crypto from 'node:crypto';

// Excludes easily confused characters (I, O, 0, 1).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Server-generated classroom join code (FR-CLASS-001). */
export function generateJoinCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return code;
}
