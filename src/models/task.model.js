import mongoose from 'mongoose';
import applyToJson from './plugins/toJSON.plugin.js';

export const TASK_PRIORITIES = ['low', 'medium', 'high'];
export const TASK_STATUSES = ['pending', 'completed'];

/**
 * Personal task — FR-TASK-001..008.
 *
 * `dueDate` is a wall-clock calendar date (YYYY-MM-DD) and `dueTime` an
 * optional wall-clock time (HH:mm), both interpreted in the owner's academic
 * timezone (FR-TASK-006, FR-PROFILE-003). Storage as strings preserves the
 * wall-clock value regardless of timezone changes.
 */
const taskSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    title: { type: String, required: [true, 'Task title is required.'], trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
    status: { type: String, enum: TASK_STATUSES, default: 'pending' },
    dueDate: {
      type: String,
      default: null,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Due date must be YYYY-MM-DD.'],
    },
    dueTime: {
      type: String,
      default: null,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Due time must be HH:mm.'],
    },
    reminderMinutesBefore: { type: Number, default: null, min: 0, max: 10080 },
    completedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    revision: { type: Number, default: 1 },
  },
  { timestamps: true },
);

taskSchema.index({ owner: 1, status: 1, deletedAt: 1 });
taskSchema.index({ owner: 1, dueDate: 1 });

applyToJson(taskSchema);

export default mongoose.model('Task', taskSchema);
