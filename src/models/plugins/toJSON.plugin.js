/**
 * Shared toJSON behaviour: expose `id` instead of `_id` and hide `__v`.
 */
export default function applyToJson(schema) {
  schema.set('toJSON', {
    virtuals: true,
    transform(_doc, ret) {
      if (ret._id) ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });
}
