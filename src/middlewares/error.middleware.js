/* eslint-disable no-unused-vars */
import env from '../config/env.js';

export function notFound(req, res) {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} does not exist.`,
  });
}

// Express recognises error middleware by its four-argument signature.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Duplicate key (e.g. racing registrations or duplicate subject codes).
  if (err && err.code === 11000) {
    return res.status(409).json({
      code: 'DUPLICATE_KEY',
      message: 'This record already exists.',
      fields: Object.keys(err.keyPattern ?? {}),
    });
  }

  // Mongoose validation.
  if (err && err.name === 'ValidationError') {
    const first = Object.values(err.errors)[0];
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: first?.message || 'Invalid data.',
    });
  }

  // Malformed ObjectId.
  if (err && err.name === 'CastError') {
    return res.status(400).json({
      code: 'INVALID_ID',
      message: 'The requested record id is invalid.',
    });
  }

  const status = err.status || 500;
  const message =
    status >= 500 && env.isProduction
      ? 'Something went wrong. Please try again.'
      : err.message || 'Something went wrong.';

  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }

  return res.status(status).json({
    code: err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'),
    message,
  });
}
