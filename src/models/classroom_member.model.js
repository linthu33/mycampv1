import mongoose from 'mongoose';
import applyToJson from './plugins/toJSON.plugin.js';

/**
 * One membership record per student/classroom pair — FR-CLASS-003..005.
 * `rejoinBlocked` is only cleared by an explicit teacher unblock, and
 * unblocking does not reactivate the membership (FR-CLASS-005).
 */
const classroomMemberSchema = new mongoose.Schema(
  {
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['active', 'left', 'removed'], default: 'active' },
    rejoinBlocked: { type: Boolean, default: false },
    joinedAt: { type: Date, default: () => new Date() },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

classroomMemberSchema.index({ classroom: 1, student: 1 }, { unique: true });

applyToJson(classroomMemberSchema);

export default mongoose.model('ClassroomMember', classroomMemberSchema);
