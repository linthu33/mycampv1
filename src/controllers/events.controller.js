import AcademicEvent from '../models/event.model.js';
import { notFound } from '../utils/http.js';
import { isValidDateKey, isValidTime } from '../utils/dates.js';

/**
 * Academic events — FR-CAL-002/003. Owner-scoped; recurring events excluded.
 */

export async function list(req, res) {
  const { from, to } = req.query;
  const filter = { owner: req.user.id, deletedAt: null };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  const events = await AcademicEvent.find(filter).sort({ date: 1, startTime: 1 });
  return res.json({ events: events.map((event) => event.toJSON()) });
}

function validateEventTimes(startTime, endTime) {
  if (startTime && !isValidTime(startTime)) return 'Start time must be HH:mm.';
  if (endTime && !isValidTime(endTime)) return 'End time must be HH:mm.';
  if (startTime && endTime && endTime <= startTime) return 'End time must be after start time.';
  return null;
}

export async function create(req, res) {
  if (!isValidDateKey(req.body.date)) {
    return res.status(400).json({ code: 'INVALID_DATE', message: 'Event date is not a real calendar date.' });
  }
  const timeError = validateEventTimes(req.body.startTime, req.body.endTime);
  if (timeError) return res.status(400).json({ code: 'INVALID_TIME', message: timeError });

  const event = await AcademicEvent.create({
    owner: req.user.id,
    title: req.body.title,
    type: req.body.type ?? 'other',
    date: req.body.date,
    startTime: req.body.startTime ?? null,
    endTime: req.body.endTime ?? null,
    description: req.body.description ?? '',
    location: req.body.location ?? '',
    reminderMinutesBefore: req.body.reminderMinutesBefore ?? null,
  });

  return res.status(201).json({ event: event.toJSON() });
}

export async function update(req, res) {
  const event = await AcademicEvent.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null });
  if (!event) return notFound(res, 'Event not found.');

  if (req.body.date !== undefined && !isValidDateKey(req.body.date)) {
    return res.status(400).json({ code: 'INVALID_DATE', message: 'Event date is not a real calendar date.' });
  }

  const nextStart = req.body.startTime !== undefined ? req.body.startTime : event.startTime;
  const nextEnd = req.body.endTime !== undefined ? req.body.endTime : event.endTime;
  const timeError = validateEventTimes(nextStart, nextEnd);
  if (timeError) return res.status(400).json({ code: 'INVALID_TIME', message: timeError });

  for (const field of [
    'title',
    'type',
    'date',
    'startTime',
    'endTime',
    'description',
    'location',
    'reminderMinutesBefore',
  ]) {
    if (req.body[field] !== undefined) event[field] = req.body[field];
  }
  event.revision += 1;
  await event.save();

  return res.json({ event: event.toJSON() });
}

export async function remove(req, res) {
  const event = await AcademicEvent.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null });
  if (!event) return notFound(res, 'Event not found.');

  event.deletedAt = new Date();
  event.revision += 1;
  await event.save();
  return res.status(204).send();
}
