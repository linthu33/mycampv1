import TimetableEntry from '../models/timetable.model.js';
import Subject from '../models/subject.model.js';
import { notFound } from '../utils/http.js';
import { isValidTime } from '../utils/dates.js';

/**
 * Weekly timetable — FR-CAL-005..007. Overlaps produce a warning rather than
 * a hard failure (FR-CAL-006).
 */

async function overlapWarnings(userId, weekday, startTime, endTime, excludeId) {
  const query = {
    owner: userId,
    weekday,
    deletedAt: null,
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  };
  if (excludeId) query._id = { $ne: excludeId };

  const overlapping = await TimetableEntry.find(query).populate('subject', 'name code');
  return overlapping.map((entry) => ({
    id: entry.id,
    subjectName: entry.subject?.name ?? 'Unknown subject',
    startTime: entry.startTime,
    endTime: entry.endTime,
  }));
}

export async function list(req, res) {
  const filter = { owner: req.user.id, deletedAt: null };
  if (req.query.weekday) filter.weekday = Number(req.query.weekday);

  const entries = await TimetableEntry.find(filter)
    .populate('subject', 'name code color')
    .sort({ weekday: 1, startTime: 1 });

  return res.json({ entries: entries.map((entry) => entry.toJSON()) });
}

export async function create(req, res) {
  const { subject, weekday, startTime, endTime } = req.body;

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return res.status(400).json({ code: 'INVALID_TIME', message: 'Times must be HH:mm.' });
  }
  if (endTime <= startTime) {
    return res.status(400).json({ code: 'INVALID_TIME_RANGE', message: 'End time must be after start time.' });
  }

  const ownedSubject = await Subject.findOne({ _id: subject, owner: req.user.id, deletedAt: null });
  if (!ownedSubject) {
    return res.status(400).json({ code: 'INVALID_SUBJECT', message: 'Select one of your own subjects.' });
  }

  const entry = await TimetableEntry.create({
    owner: req.user.id,
    subject,
    weekday,
    startTime,
    endTime,
    room: req.body.room ?? '',
  });

  const warnings = await overlapWarnings(req.user.id, weekday, startTime, endTime, entry._id);
  await entry.populate('subject', 'name code color');
  return res.status(201).json({ entry: entry.toJSON(), warnings });
}

export async function update(req, res) {
  const entry = await TimetableEntry.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null });
  if (!entry) return notFound(res, 'Timetable entry not found.');

  const nextStart = req.body.startTime ?? entry.startTime;
  const nextEnd = req.body.endTime ?? entry.endTime;
  if (!isValidTime(nextStart) || !isValidTime(nextEnd)) {
    return res.status(400).json({ code: 'INVALID_TIME', message: 'Times must be HH:mm.' });
  }
  if (nextEnd <= nextStart) {
    return res.status(400).json({ code: 'INVALID_TIME_RANGE', message: 'End time must be after start time.' });
  }
  if (req.body.subject) {
    const ownedSubject = await Subject.findOne({
      _id: req.body.subject,
      owner: req.user.id,
      deletedAt: null,
    });
    if (!ownedSubject) {
      return res.status(400).json({ code: 'INVALID_SUBJECT', message: 'Select one of your own subjects.' });
    }
  }

  for (const field of ['subject', 'weekday', 'startTime', 'endTime', 'room']) {
    if (req.body[field] !== undefined) entry[field] = req.body[field];
  }
  await entry.save();

  const warnings = await overlapWarnings(
    req.user.id,
    entry.weekday,
    entry.startTime,
    entry.endTime,
    entry._id,
  );
  await entry.populate('subject', 'name code color');
  return res.json({ entry: entry.toJSON(), warnings });
}

export async function remove(req, res) {
  const entry = await TimetableEntry.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null });
  if (!entry) return notFound(res, 'Timetable entry not found.');

  entry.deletedAt = new Date();
  await entry.save();
  return res.status(204).send();
}
