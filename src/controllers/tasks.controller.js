import Task from '../models/task.model.js';
import Subject from '../models/subject.model.js';
import { escapeRegex, notFound } from '../utils/http.js';
import { isValidDateKey, isValidTime } from '../utils/dates.js';

/**
 * Personal tasks — FR-TASK-001..008. All queries are owner-scoped.
 */

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function timeOf(task) {
  return task.dueTime ?? '23:59';
}

function sortTasks(tasks, sort, order) {
  const direction = order === 'desc' ? -1 : 1;
  const sorted = [...tasks];

  if (sort === 'priority') {
    sorted.sort((a, b) => direction * (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]));
  } else if (sort === 'title') {
    sorted.sort((a, b) => direction * a.title.localeCompare(b.title));
  } else if (sort === 'createdAt') {
    sorted.sort((a, b) => direction * (a.createdAt - b.createdAt));
  } else {
    // Default: nearest deadline first, undated tasks last (FR-TASK-006).
    sorted.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return direction * (a.createdAt - b.createdAt);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      const left = `${a.dueDate} ${timeOf(a)}`;
      const right = `${b.dueDate} ${timeOf(b)}`;
      return direction * left.localeCompare(right);
    });
  }
  return sorted;
}

async function ownsSubject(userId, subjectId) {
  if (!subjectId) return false;
  return Boolean(await Subject.exists({ _id: subjectId, owner: userId, deletedAt: null }));
}

export async function list(req, res) {
  const { status = 'all', q = '', subject = '', sort = 'dueDate', order = 'asc' } = req.query;

  const filter = { owner: req.user.id, deletedAt: null };
  if (status === 'pending' || status === 'completed') filter.status = status;
  if (subject === 'general') filter.subject = null;
  else if (subject) filter.subject = subject;
  if (q.trim()) {
    const pattern = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }];
  }

  const [all, tasks] = await Promise.all([
    Task.find({ owner: req.user.id, deletedAt: null }).select('status'),
    Task.find(filter).populate('subject', 'name code color'),
  ]);

  const counts = {
    all: all.length,
    pending: all.filter((task) => task.status === 'pending').length,
    completed: all.filter((task) => task.status === 'completed').length,
  };

  return res.json({
    tasks: sortTasks(tasks, sort, order).map((task) => task.toJSON()),
    counts,
  });
}

export async function create(req, res) {
  const { subject } = req.body;

  if (subject && !(await ownsSubject(req.user.id, subject))) {
    return res.status(400).json({ code: 'INVALID_SUBJECT', message: 'Select one of your own subjects.' });
  }
  if (req.body.dueDate && !isValidDateKey(req.body.dueDate)) {
    return res.status(400).json({ code: 'INVALID_DATE', message: 'Due date is not a real calendar date.' });
  }
  if (req.body.dueTime && !isValidTime(req.body.dueTime)) {
    return res.status(400).json({ code: 'INVALID_TIME', message: 'Due time must be HH:mm.' });
  }

  const completed = req.body.status === 'completed';
  const task = await Task.create({
    owner: req.user.id,
    title: req.body.title,
    description: req.body.description ?? '',
    subject: subject || null,
    priority: req.body.priority ?? 'medium',
    status: completed ? 'completed' : 'pending',
    dueDate: req.body.dueDate ?? null,
    dueTime: req.body.dueTime ?? null,
    reminderMinutesBefore: req.body.reminderMinutesBefore ?? null,
    completedAt: completed ? new Date() : null,
  });

  await task.populate('subject', 'name code color');
  return res.status(201).json({ task: task.toJSON() });
}

export async function update(req, res) {
  const task = await Task.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null });
  if (!task) return notFound(res, 'Task not found.');

  if (req.body.subject && !(await ownsSubject(req.user.id, req.body.subject))) {
    return res.status(400).json({ code: 'INVALID_SUBJECT', message: 'Select one of your own subjects.' });
  }
  if (req.body.dueDate && !isValidDateKey(req.body.dueDate)) {
    return res.status(400).json({ code: 'INVALID_DATE', message: 'Due date is not a real calendar date.' });
  }
  if (req.body.dueTime && !isValidTime(req.body.dueTime)) {
    return res.status(400).json({ code: 'INVALID_TIME', message: 'Due time must be HH:mm.' });
  }

  for (const field of [
    'title',
    'description',
    'priority',
    'dueDate',
    'dueTime',
    'reminderMinutesBefore',
  ]) {
    if (req.body[field] !== undefined) task[field] = req.body[field];
  }
  if (req.body.subject !== undefined) {
    task.subject = req.body.subject === '' || req.body.subject === null ? null : req.body.subject;
  }
  if (req.body.status !== undefined && req.body.status !== task.status) {
    task.status = req.body.status;
    task.completedAt = req.body.status === 'completed' ? new Date() : null;
  }
  task.revision += 1;
  await task.save();

  await task.populate('subject', 'name code color');
  return res.json({ task: task.toJSON() });
}

export async function remove(req, res) {
  const task = await Task.findOne({ _id: req.params.id, owner: req.user.id, deletedAt: null });
  if (!task) return notFound(res, 'Task not found.');

  task.deletedAt = new Date();
  task.revision += 1;
  await task.save();
  return res.status(204).send();
}
