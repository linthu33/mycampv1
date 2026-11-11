export function notFound(res, message = 'Record not found.') {
  return res.status(404).json({ code: 'NOT_FOUND', message });
}

export function forbidden(res, message = 'You do not have access to this record.') {
  return res.status(403).json({ code: 'FORBIDDEN', message });
}

export function badRequest(res, code, message) {
  return res.status(400).json({ code, message });
}

export function conflict(res, code, message, extra = {}) {
  return res.status(409).json({ code, message, ...extra });
}

/** Escapes a user string for safe use inside a RegExp. */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
