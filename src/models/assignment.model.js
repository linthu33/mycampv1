import mongoose from 'mongoose';
import applyToJson from './plugins/toJSON.plugin.js';

export const ASSIGNMENT_STATUSES = ['draft', 'published', 'archived'];

/**
 * Assignment — FR-ASG-001..008.
 *
 * `deletedAt` implements the soft-deletion tombstone required by FR-ASG-007.
 * Teachers never receive progress aggregates (FR-ASG-005).
 */
const assignmentSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
    title: { type: String, required: [true, 'Assignment title is required.'], trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 4000, default: '' },
    dueDate: {
      type: String,
      required: [true, 'Due date is required.'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD.'],
    },
    dueTime: {
      type: String,
      default: null,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Due time must be HH:mm.'],
    },
    status: { type: String, enum: ASSIGNMENT_STATUSES, default: 'draft' },
    publishedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    revision: { type: Number, default: 1 },
  },
  { timestamps: true },
);

assignmentSchema.index({ classroom: 1, status: 1, deletedAt: 1 });

applyToJson(assignmentSchema);

export default mongoose.model('Assignment', assignmentSchema);
