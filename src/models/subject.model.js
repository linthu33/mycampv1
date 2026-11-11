import mongoose from 'mongoose';
import applyToJson from './plugins/toJSON.plugin.js';

/**
 * Subject — FR-SUB-001..005.
 *
 * Codes are stored uppercase so uniqueness is case-insensitive (FR-SUB-002).
 * Only active (non-deleted) codes participate in the unique index, so a
 * deleted subject's code can be reused.
 */
const subjectSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: [true, 'Subject name is required.'], trim: true, maxlength: 120 },
    code: { type: String, required: [true, 'Subject code is required.'], trim: true, uppercase: true, maxlength: 16 },
    color: { type: String, default: '#6236F5', match: /^#[0-9a-fA-F]{6}$/ },
    teacherName: { type: String, trim: true, maxlength: 120, default: '' },
    room: { type: String, trim: true, maxlength: 60, default: '' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

subjectSchema.index(
  { owner: 1, code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);

applyToJson(subjectSchema);

export default mongoose.model('Subject', subjectSchema);
