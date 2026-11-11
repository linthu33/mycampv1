import mongoose from 'mongoose';
import applyToJson from './plugins/toJSON.plugin.js';

/**
 * Per-student assignment completion — FR-ASG-004, FR-ASG-005, SEC-010.
 *
 * Strict privacy: only the owning student may read this record. Teachers are
 * never given a route that exposes progress, even in aggregate.
 */
const assignmentProgressSchema = new mongoose.Schema(
  {
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    revision: { type: Number, default: 1 },
  },
  { timestamps: true },
);

assignmentProgressSchema.index({ assignment: 1, student: 1 }, { unique: true });

applyToJson(assignmentProgressSchema);

export default mongoose.model('AssignmentProgress', assignmentProgressSchema);
