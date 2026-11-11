/**
 * End-to-end smoke test for FR-AUTH-001 .. FR-AUTH-010.
 *
 * Usage:
 *   node scripts/smoke-test.mjs
 *
 * Requires the API to be running (npm start) with MongoDB available and
 * EXPOSE_DEV_CODES=true so verification/reset codes are returned in dev.
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:4000/api';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await response.json();
  } catch (_err) {
    json = null;
  }
  return { status: response.status, body: json };
}

async function run() {
  const email = `smoke.${Date.now()}@mycampus.dev`;
  const password = 'Campus12345';
  const newPassword = 'Campus67890';

  console.log(`\nMyCampus auth smoke test → ${BASE}\n`);

  const health = await call('GET', '/health');
  check('health endpoint responds', health.status === 200, `status ${health.status}`);

  // FR-AUTH-001 — register student
  const registered = await call('POST', '/auth/register', {
    body: { fullName: 'Smoke Student', email, password, role: 'student' },
  });
  check('register returns 201', registered.status === 201, JSON.stringify(registered.body));
  const firstCode = registered.body?.devCode;
  check('register issues a dev verification code', typeof firstCode === 'string' && firstCode.length === 6);

  // FR-AUTH-002 / 003 — role validation + teacher registration shape
  const badRole = await call('POST', '/auth/register', {
    body: { fullName: 'Bad Role', email: `bad.${Date.now()}@mycampus.dev`, password, role: 'admin' },
  });
  check('invalid role rejected (no admin role)', badRole.status === 400);

  // Duplicate pending registration re-issues the code instead of duplicating
  const reRegister = await call('POST', '/auth/register', {
    body: { fullName: 'Smoke Student', email, password, role: 'student' },
  });
  check('pending duplicate registration returns 200/VERIFICATION_RESENT', reRegister.status === 200, JSON.stringify(reRegister.body));
  const code = reRegister.body?.devCode || firstCode;

  // FR-AUTH-006 — login blocked before verification
  const earlyLogin = await call('POST', '/auth/login', { body: { email, password } });
  check('login blocked before verification', earlyLogin.status === 403 && earlyLogin.body?.code === 'EMAIL_NOT_VERIFIED');

  // Wrong code rejected
  const wrongCode = await call('POST', '/auth/verify-email', { body: { email, code: '000000' } });
  check('wrong verification code rejected', wrongCode.status === 400);

  // FR-AUTH-001/006 — verify email, receive session
  const verified = await call('POST', '/auth/verify-email', { body: { email, code } });
  check('verify-email returns a token', verified.status === 200 && typeof verified.body?.token === 'string', JSON.stringify(verified.body));
  let token = verified.body?.token;
  check('user payload exposes role + emailVerified', verified.body?.user?.role === 'student' && verified.body?.user?.emailVerified === true);
  check('user payload never exposes passwordHash', verified.body?.user?.passwordHash === undefined);

  // FR-AUTH-004 — login
  const login = await call('POST', '/auth/login', { body: { email, password } });
  check('login after verification succeeds', login.status === 200 && typeof login.body?.token === 'string');
  token = login.body?.token || token;

  // FR-AUTH-009 — revalidation endpoint
  const me = await call('GET', '/auth/me', { token });
  check('GET /me returns the current account', me.status === 200 && me.body?.user?.email === email);

  // FR-AUTH-007 — profile edit, email/role read-only
  const badTimezone = await call('PATCH', '/auth/profile', { token, body: { academicTimezone: 'Not/AZone' } });
  check('invalid IANA timezone rejected', badTimezone.status === 400);

  const updated = await call('PATCH', '/auth/profile', {
    token,
    body: { fullName: 'Smoke Student Updated', academicTimezone: 'Asia/Bangkok', role: 'teacher' },
  });
  check('profile update succeeds', updated.status === 200);
  check('full name updated', updated.body?.user?.fullName === 'Smoke Student Updated');
  check('role cannot be changed by a client', updated.body?.user?.role === 'student');
  check('timezone updated', updated.body?.user?.academicTimezone === 'Asia/Bangkok');

  // FR-AUTH-005 — password recovery
  const forgot = await call('POST', '/auth/forgot-password', { body: { email } });
  check('forgot-password responds', forgot.status === 200);
  const resetCode = forgot.body?.devCode;
  check('forgot-password issues a dev reset code', typeof resetCode === 'string' && resetCode.length === 6);

  const reset = await call('POST', '/auth/reset-password', {
    body: { email, code: resetCode, password: newPassword },
  });
  check('reset-password succeeds', reset.status === 200, JSON.stringify(reset.body));

  const oldLogin = await call('POST', '/auth/login', { body: { email, password } });
  check('old password no longer works', oldLogin.status === 401);

  const newLogin = await call('POST', '/auth/login', { body: { email, password: newPassword } });
  check('new password works', newLogin.status === 200);

  // FR-AUTH-006 — protected route without token
  const noToken = await call('GET', '/auth/me');
  check('protected route rejects missing token', noToken.status === 401);

  // FR-AUTH-010 — logout endpoint
  const logout = await call('POST', '/auth/logout', { token: newLogin.body?.token });
  check('logout responds 204', logout.status === 204);

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error('\nSmoke test crashed:', err);
  process.exitCode = 1;
});
