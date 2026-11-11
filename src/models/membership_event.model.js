import mongoose from 'mongoose';
import applyToJson from './plugins/toJSON.plugin.js';

export const MEMBERSHIP_EVENT_TYPES = [
  'join',
  'leave',
  'remove',
  'unblock',
  'code_reset',
  'archive',
];

/**
 * Append-only membership audit trail — FR-CLASS-008.
 * Actors are attributed so teachers see events for their classroom and
 * students see their own events.
 */
const membershipEventSchema = new mongoose.Schema(
  {
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true, index: true },
    membership: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassroomMember', default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: MEMBERSHIP_EVENT_TYPES, required: true },
    note: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

membershipEventSchema.index({ classroom: 1, createdAt: -1 });
membershipEventSchema.index({ student: 1, createdAt: -1 });

applyToJson(membershipEventSchema);

export default mongoose.model('MembershipEvent', membershipEventSchema);
