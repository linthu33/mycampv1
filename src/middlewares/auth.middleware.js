import User from '../models/user.model.js';
import { verifyToken } from '../utils/jwt.js';

/**
 * Requires a valid Bearer token AND a verified email (FR-AUTH-006).
 * The user is re-loaded from the database on every request so role and
 * account state are always server-authoritative (FR-AUTH-003, FR-AUTH-009,
 * SEC-009).
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required.' });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Session expired. Please sign in again.' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ code: 'ACCOUNT_NOT_FOUND', message: 'This account no longer exists.' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email address to continue.',
        email: user.email,
      });
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Role gate for server-authoritative authorization (FR-CLASS-001,
 * FR-ASG-001, SEC-009). Never trust a role supplied by the client.
 */
export function requireRole(...roles) {
  return function roleGate(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Your account role does not allow this operation.',
      });
    }
    return next();
  };
}
