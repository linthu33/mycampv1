import mongoose from 'mongoose';
import applyToJson from './plugins/toJSON.plugin.js';

/**
 * Classroom — FR-CLASS-001..007, FR-CLASS-010.
 *
 * `academicTimezone` is captured from the teacher's profile at creation and
 * is immutable afterwards (FR-CLASS-010).
 */
const classroomSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: [true, 'Classroom name is required.'], trim: true, maxlength: 120 },
    subjectName: { type: String, required: [true, 'Subject name is required.'], trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    joinCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    academicTimezone: { type: String, required: true, immutable: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

applyToJson(classroomSchema);

export default mongoose.model('Classroom', classroomSchema);
