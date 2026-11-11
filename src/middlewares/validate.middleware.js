/**
 * Validates req.body against a Zod schema and replaces it with the parsed,
 * normalised value. Responds 400 VALIDATION_ERROR with readable messages.
 */
export default function validate(schema) {
  return function validateBody(req, res, next) {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const first = result.error.issues[0];
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: first?.message || 'Invalid request body.',
        fields: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    req.body = result.data;
    return next();
  };
}
