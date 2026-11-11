import Subject from '../models/subject.model.js';
import Task from '../models/task.model.js';
import TimetableEntry from '../models/timetable.model.js';
import { conflict, notFound } from '../utils/http.js';

/**
 * Subjects — FR-SUB-001..005. Every query is scoped to req.user.id, so a user
 * can only read or mutate their own records (SEC-009).
 */

export async function list(req, res) {
  const subjects = await Subject.find({ owner: req.user.id, deletedAt: null }).sort({ name: 1 });
  return res.json({ subjects: subjects.map((subject) => subject.toJSON()) });
}

export async function getOne(req, res) {
  const subject = await Subject.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null });
  if (!subject) return notFound(res, 'Subject not found.');
  return res.json({ subject: subject.toJSON() });
}

export async function create(req, res) {
  const { name, code, color, teacherName, room } = req.body;

  const duplicate = await Subject.findOne({
    owner: req.user.id,
    code: code.toUpperCase(),
    deletedAt: null,
  });
  if (duplicate) {
    return conflict(res, 'SUBJECT_CODE_TAKEN', `The code ${code.toUpperCase()} is already used by another subject.`);
  }

  const subject = await Subject.create({
    owner: req.user.id,
    name,
    code,
    ...(color ? { color } : {}),
    teacherName: teacherName ?? '',
    room: room ?? '',
  });

  return res.status(201).json({ subject: subject.toJSON() });
}

export async function update(req, res) {
  const subject = await Subject.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null });
  if (!subject) return notFound(res, 'Subject not found.');

  if (req.body.code && req.body.code.toUpperCase() !== subject.code) {
    const duplicate = await Subject.findOne({
      owner: req.user.id,
      code: req.body.code.toUpperCase(),
      deletedAt: null,
      _id: { $ne: subject._id },
    });
    if (duplicate) {
      return conflict(
        res,
        'SUBJECT_CODE_TAKEN',
        `The code ${req.body.code.toUpperCase()} is already used by another subject.`,
      );
    }
  }

  for (const field of ['name', 'code', 'color', 'teacherName', 'room']) {
    if (req.body[field] !== undefined) subject[field] = req.body[field];
  }
  await subject.save();

  return res.json({ subject: subject.toJSON() });
}

/**
 * FR-SUB-004: show the impact before deletion so the client can confirm.
 */
export async function impact(req, res) {
  const subject = await Subject.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null });
  if (!subject) return notFound(res, 'Subject not found.');

  const [taskCount, timetableCount] = await Promise.all([
    Task.countDocuments({ owner: req.user.id, subject: subject._id, deletedAt: null }),
    TimetableEntry.countDocuments({ owner: req.user.id, subject: subject._id, deletedAt: null }),
  ]);

  return res.json({
    impact: {
      subjectName: subject.name,
      tasksMovedToGeneral: taskCount,
      timetableEntriesRemoved: timetableCount,
    },
  });
}

/**
 * FR-SUB-004: tasks are preserved with a null subject (General Tasks),
 * timetable entries are removed, and deletion requires explicit confirmation.
 */
export async function remove(req, res) {
  const subject = await Subject.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null });
  if (!subject) return notFound(res, 'Subject not found.');

  const [taskCount, timetableCount] = await Promise.all([
    Task.countDocuments({ owner: req.user.id, subject: subject._id, deletedAt: null }),
    TimetableEntry.countDocuments({ owner: req.user.id, subject: subject._id, deletedAt: null }),
  ]);

  if (req.query.confirm !== 'true') {
    return conflict(res, 'IMPACT_CONFIRMATION_REQUIRED', 'Confirm deletion to see and accept the impact.', {
      impact: { tasksMovedToGeneral: taskCount, timetableEntriesRemoved: timetableCount },
    });
  }

  await Promise.all([
    Task.updateMany({ owner: req.user.id, subject: subject._id }, { $set: { subject: null } }),
    TimetableEntry.updateMany(
      { owner: req.user.id, subject: subject._id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
    ),
  ]);

  subject.deletedAt = new Date();
  await subject.save();

  return res.json({
    message: 'Subject deleted. Related tasks moved to General Tasks.',
    impact: { tasksMovedToGeneral: taskCount, timetableEntriesRemoved: timetableCount },
  });
}
