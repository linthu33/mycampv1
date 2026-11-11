import mongoose from 'mongoose';
import applyToJson from './plugins/toJSON.plugin.js';

export const EVENT_TYPES = ['exam', 'meeting', 'seminar', 'study_session', 'other'];

/**
 * Academic event — FR-CAL-002/003. Recurring events are excluded from MVP.
 */
const academicEventSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: [true, 'Event title is required.'], trim: true, maxlength: 160 },
    type: { type: String, enum: EVENT_TYPES, default: 'other' },
    date: {
      type: String,
      required: [true, 'Event date is required.'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Event date must be YYYY-MM-DD.'],
    },
    startTime: {
      type: String,
      default: null,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be HH:mm.'],
    },
    endTime: {
      type: String,
      default: null,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be HH:mm.'],
    },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    location: { type: String, trim: true, maxlength: 160, default: '' },
    reminderMinutesBefore: { type: Number, default: null, min: 0, max: 10080 },
    deletedAt: { type: Date, default: null },
    revision: { type: Number, default: 1 },
  },
  { timestamps: true },
);

academicEventSchema.index({ owner: 1, date: 1 });

applyToJson(academicEventSchema);

export default mongoose.model('AcademicEvent', academicEventSchema);
