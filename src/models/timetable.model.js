import mongoose from 'mongoose';
import applyToJson from './plugins/toJSON.plugin.js';

/**
 * Recurring Monday–Friday timetable entry — FR-CAL-005..007.
 * Times are wall-clock strings (HH:mm) in the owner's academic timezone.
 */
const timetableEntrySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    weekday: { type: Number, required: true, min: 1, max: 5 },
    startTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be HH:mm.'],
    },
    endTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be HH:mm.'],
    },
    room: { type: String, trim: true, maxlength: 60, default: '' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

timetableEntrySchema.index({ owner: 1, weekday: 1 });

applyToJson(timetableEntrySchema);

export default mongoose.model('TimetableEntry', timetableEntrySchema);
