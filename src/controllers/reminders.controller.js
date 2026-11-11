import Task from '../models/task.model.js';
import AcademicEvent from '../models/event.model.js';
import ClassroomMember from '../models/classroom_member.model.js';
import Assignment from '../models/assignment.model.js';
import AssignmentProgress from '../models/assignment_progress.model.js';
import { deadlineInstant, todayKey } from '../utils/dates.js';

/**
 * In-app Reminder Center — FR-REM-002/004.
 *
 * Windows has no guaranteed local notification delivery (FR-REM-005), so the
 * server exposes the same derived schedule the client uses for local
 * notifications: Due Soon (next 24h), Overdue, and Upcoming.
 *
 * Date-only deadlines resolve to end-of-day in the user's academic timezone.
 */

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

function reminderFor(kind, record, timeZone) {
  const dueDate = record.dueDate ?? record.date;
  const dueTime = record.dueTime ?? record.startTime ?? null;
  const deadline = deadlineInstant({ dueDate, dueTime }, timeZone);
  if (!deadline) return null;

  const offsetMinutes = record.reminderMinutesBefore ?? 0;
  const remindAt = new Date(deadline.getTime() - offsetMinutes * 60 * 1000);

  return {
    kind,
    id: record.id,
    title: record.title,
    reminderMinutesBefore: record.reminderMinutesBefore ?? null,
    dueDate,
    dueTime,
    deadline: deadline.toISOString(),
    remindAt: remindAt.toISOString(),
  };
}

function categorize(items, now) {
  const dueSoon = [];
  const overdue = [];
  const upcoming = [];

  for (const item of items) {
    const deadlineMs = new Date(item.deadline).getTime();
    const remindMs = new Date(item.remindAt).getTime();
    if (deadlineMs < now.getTime()) overdue.push(item);
    else if (remindMs <= now.getTime() + DUE_SOON_WINDOW_MS) dueSoon.push(item);
    else upcoming.push(item);
  }

  const byDeadline = (a, b) => a.deadline.localeCompare(b.deadline);
  dueSoon.sort(byDeadline);
  overdue.sort((a, b) => b.deadline.localeCompare(a.deadline));
  upcoming.sort(byDeadline);
  return { dueSoon, overdue, upcoming };
}

export async function list(req, res) {
  const timeZone = req.user.academicTimezone;
  const now = new Date();
  const today = todayKey(timeZone);

  const [tasks, events] = await Promise.all([
    Task.find({ owner: req.user.id, deletedAt: null, status: 'pending', dueDate: { $ne: null } })
      .populate('subject', 'name code color')
      .sort({ dueDate: 1, dueTime: 1 }),
    AcademicEvent.find({
      owner: req.user.id,
      deletedAt: null,
      date: { $gte: today },
      reminderMinutesBefore: { $ne: null },
    }).sort({ date: 1, startTime: 1 }),
  ]);

  const items = [];

  for (const task of tasks) {
    const reminder = reminderFor('task', task, timeZone);
    if (reminder) {
      reminder.subjectName = task.subject?.name ?? null;
      items.push(reminder);
    }
  }

  for (const event of events) {
    const reminder = reminderFor('event', event, timeZone);
    if (reminder) {
      reminder.eventType = event.type;
      reminder.location = event.location ?? '';
      items.push(reminder);
    }
  }

  // Students also need assignment deadlines from active classrooms.
  if (req.user.role === 'student') {
    const memberships = await ClassroomMember.find({ student: req.user.id, status: 'active' }).select(
      'classroom',
    );
    const classroomIds = memberships.map((membership) => membership.classroom);

    if (classroomIds.length) {
      const assignments = await Assignment.find({
        classroom: { $in: classroomIds },
        status: 'published',
        deletedAt: null,
      })
        .populate('classroom', 'name subjectName')
        .sort({ dueDate: 1, dueTime: 1 });

      const progressRecords = await AssignmentProgress.find({
        student: req.user.id,
        assignment: { $in: assignments.map((assignment) => assignment._id) },
        completed: true,
      });
      const completedIds = new Set(progressRecords.map((record) => record.assignment.toString()));

      for (const assignment of assignments) {
        if (completedIds.has(assignment.id)) continue;
        const reminder = reminderFor('assignment', assignment, timeZone);
        if (reminder) {
          reminder.classroomName = assignment.classroom?.name ?? '';
          reminder.subjectName = assignment.classroom?.subjectName ?? '';
          items.push(reminder);
        }
      }
    }
  }

  const { dueSoon, overdue, upcoming } = categorize(items, now);

  return res.json({
    academicTimezone: timeZone,
    timeFormat: req.user.timeFormat,
    generatedAt: now.toISOString(),
    counts: {
      dueSoon: dueSoon.length,
      overdue: overdue.length,
      upcoming: upcoming.length,
      total: dueSoon.length + overdue.length + upcoming.length,
    },
    dueSoon,
    overdue,
    upcoming,
  });
}
