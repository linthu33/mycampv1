import Subject from '../models/subject.model.js';
import Task from '../models/task.model.js';
import AcademicEvent from '../models/event.model.js';
import TimetableEntry from '../models/timetable.model.js';
import Classroom from '../models/classroom.model.js';
import ClassroomMember from '../models/classroom_member.model.js';
import Assignment from '../models/assignment.model.js';
import AssignmentProgress from '../models/assignment_progress.model.js';
import { deadlineInstant, todayKey, weekdayInZone } from '../utils/dates.js';

/**
 * Role-specific home dashboard — FR-NAV-003/004/005.
 *
 * Upcoming deadlines combine pending personal tasks and visible published
 * assignments, excluding completed/undated tasks and completed assignments,
 * sorted nearest-first and flagged as overdue (FR-NAV-005).
 */

const MAX_DEADLINES = 12;
const MAX_EVENTS = 5;

function withDeadline(kind, record, timeZone, now) {
  const instant = deadlineInstant(record, timeZone);
  if (!instant) return null;
  return {
    kind,
    id: record.id,
    title: record.title,
    dueDate: record.dueDate,
    dueTime: record.dueTime ?? null,
    deadline: instant.toISOString(),
    overdue: instant.getTime() < now.getTime(),
    subjectId: record.subject?._id ? String(record.subject._id) : record.subject ?? null,
    subjectName: record.subject?.name ?? null,
    classroomId: record.classroom?._id ? String(record.classroom._id) : record.classroom ?? null,
    classroomName: record.classroom?.name ?? null,
  };
}

export async function home(req, res) {
  const timeZone = req.user.academicTimezone;
  const now = new Date();
  const today = todayKey(timeZone);
  const weekday = weekdayInZone(timeZone);

  const schedule = await TimetableEntry.find({
    owner: req.user.id,
    weekday,
    deletedAt: null,
  })
    .populate('subject', 'name code color')
    .sort({ startTime: 1 });

  const personalEvents = await AcademicEvent.find({
    owner: req.user.id,
    deletedAt: null,
    date: { $gte: today },
  })
    .sort({ date: 1, startTime: 1 })
    .limit(MAX_EVENTS);

  const pendingTasks = await Task.find({
    owner: req.user.id,
    deletedAt: null,
    status: 'pending',
  })
    .populate('subject', 'name code color')
    .sort({ dueDate: 1, dueTime: 1 });

  const base = {
    role: req.user.role,
    today,
    weekday,
    academicTimezone: timeZone,
    timeFormat: req.user.timeFormat,
    schedule: schedule.map((entry) => entry.toJSON()),
    events: personalEvents.map((event) => event.toJSON()),
  };

  if (req.user.role === 'teacher') {
    const classrooms = await Classroom.find({ teacher: req.user.id }).sort({ createdAt: -1 });
    const withCounts = await Promise.all(
      classrooms.map(async (classroom) => ({
        ...classroom.toJSON(),
        memberCount: await ClassroomMember.countDocuments({
          classroom: classroom._id,
          status: 'active',
        }),
      })),
    );
    const publishedAssignments = await Assignment.find({
      teacher: req.user.id,
      status: 'published',
      deletedAt: null,
    })
      .populate('classroom', 'name')
      .sort({ dueDate: 1, dueTime: 1 })
      .limit(MAX_DEADLINES);

    // Teachers see their own task deadlines only; never student progress.
    const deadlines = pendingTasks
      .map((task) => withDeadline('task', task, timeZone, now))
      .filter(Boolean)
      .sort((a, b) => a.deadline.localeCompare(b.deadline))
      .slice(0, MAX_DEADLINES);

    return res.json({
      ...base,
      classrooms: withCounts,
      publishedAssignments: publishedAssignments.map((assignment) => ({
        ...assignment.toJSON(),
        classroomName: assignment.classroom?.name ?? '',
      })),
      pendingTasks: pendingTasks.slice(0, MAX_DEADLINES).map((task) => task.toJSON()),
      deadlines,
      quickActions: ['create_classroom', 'create_assignment', 'create_task', 'create_event'],
    });
  }

  // ---- Student dashboard ---------------------------------------------------
  const subjects = await Subject.find({ owner: req.user.id, deletedAt: null }).sort({ name: 1 });

  const memberships = await ClassroomMember.find({ student: req.user.id, status: 'active' })
    .populate({ path: 'classroom', populate: { path: 'teacher', select: 'fullName' } })
    .sort({ updatedAt: -1 });

  const classrooms = memberships
    .filter((membership) => membership.classroom)
    .map((membership) => ({
      ...membership.classroom.toJSON(),
      role: 'student',
      membershipId: membership.id,
      teacherName: membership.classroom.teacher?.fullName ?? 'Teacher',
      joinedAt: membership.joinedAt,
    }));

  const classroomIds = memberships.map((membership) => membership.classroom?._id).filter(Boolean);

  const publishedAssignments = classroomIds.length
    ? await Assignment.find({
        classroom: { $in: classroomIds },
        status: 'published',
        deletedAt: null,
      })
        .populate('classroom', 'name subjectName')
        .sort({ dueDate: 1, dueTime: 1 })
        .limit(MAX_DEADLINES)
    : [];

  const progressRecords = publishedAssignments.length
    ? await AssignmentProgress.find({
        student: req.user.id,
        assignment: { $in: publishedAssignments.map((assignment) => assignment._id) },
      })
    : [];
  const completedIds = new Set(
    progressRecords.filter((record) => record.completed).map((record) => record.assignment.toString()),
  );

  const taskDeadlines = pendingTasks
    .map((task) => withDeadline('task', task, timeZone, now))
    .filter(Boolean);

  const assignmentDeadlines = publishedAssignments
    .filter((assignment) => !completedIds.has(assignment.id))
    .map((assignment) =>
      withDeadline(
        'assignment',
        {
          ...assignment.toJSON(),
          subject: null,
          classroom: assignment.classroom,
        },
        timeZone,
        now,
      ),
    )
    .filter(Boolean);

  const deadlines = [...taskDeadlines, ...assignmentDeadlines]
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, MAX_DEADLINES);

  return res.json({
    ...base,
    subjects: subjects.map((subject) => subject.toJSON()),
    classrooms,
    pendingTasks: pendingTasks.slice(0, MAX_DEADLINES).map((task) => task.toJSON()),
    assignments: publishedAssignments.map((assignment) => ({
      ...assignment.toJSON(),
      classroomName: assignment.classroom?.name ?? '',
      subjectName: assignment.classroom?.subjectName ?? '',
      completed: completedIds.has(assignment.id),
    })),
    deadlines,
    quickActions: ['create_task', 'create_event', 'join_classroom'],
  });
}

/**
 * Full-day schedule drilldown — FR-NAV-004. `date` defaults to today in the
 * user's academic timezone; the weekday drives the recurring timetable.
 */
export async function daySchedule(req, res) {
  const timeZone = req.user.academicTimezone;
  const date = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : todayKey(timeZone);

  const [year, month, day] = date.split('-').map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekday = ((jsDay + 6) % 7) + 1;

  const [schedule, tasks, events] = await Promise.all([
    TimetableEntry.find({ owner: req.user.id, weekday, deletedAt: null })
      .populate('subject', 'name code color')
      .sort({ startTime: 1 }),
    Task.find({ owner: req.user.id, deletedAt: null, dueDate: date })
      .populate('subject', 'name code color')
      .sort({ dueTime: 1 }),
    AcademicEvent.find({ owner: req.user.id, deletedAt: null, date })
      .sort({ startTime: 1 }),
  ]);

  return res.json({
    date,
    weekday,
    academicTimezone: timeZone,
    schedule: schedule.map((entry) => entry.toJSON()),
    tasks: tasks.map((task) => task.toJSON()),
    events: events.map((event) => event.toJSON()),
  });
}
