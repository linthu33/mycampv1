import env from '../config/env.js';

/**
 * MVP email delivery.
 *
 * No SMTP provider is configured, so messages are written to the server
 * console. Replace the two functions below with Nodemailer / Resend / SES
 * when a provider is available — the rest of the auth flow does not change.
 */
export async function sendVerificationEmail(user, code) {
  // eslint-disable-next-line no-console
  console.log(
    `\n[email:verification] to=${user.email}\n  code=${code}\n  expires in 15 minutes\n`,
  );
}

export async function sendPasswordResetEmail(user, code) {
  // eslint-disable-next-line no-console
  console.log(
    `\n[email:password-reset] to=${user.email}\n  code=${code}\n  expires in 15 minutes\n`,
  );
}

/** Whether API responses may include the code (development convenience). */
export function devCode(code) {
  return env.exposeDevCodes ? code : undefined;
}
