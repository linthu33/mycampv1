import Assignment from '../models/assignment.model.js';
import AssignmentProgress from '../models/assignment_progress.model.js';
import Classroom from '../models/classroom.model.js';
import ClassroomMember from '../models/classroom_member.model.js';
import { conflict, forbidden, notFound } from '../utils/http.js';
import { isValidDateKey, isValidTime } from '../utils/dates.js';

/**
 * Assignments and student completion — FR-ASG-001..008.
 *
 * Privacy contract (FR-ASG-005, SEC-010): no teacher-facing response in this
 * module ever contains a completion record, a completion count or a
 * percentage. Teacher queries only select assignment documents.
 */

async function ownedClassroom(teacherId, classroomId) {
  return Classroom.findOne({ _id: classroomId, teacher: teacherId });
}

async function activeMembership(studentId, classroomId) {
  return ClassroomMember.findOne({
    classroom: classroomId,
    student: studentId,
    status: 'active',
  });
}

/** Visible student assignments: published, not deleted, active membership. */
function visibleStudentAssignmentFilter(classroomIds) {
  return {
    classroom: { $in: classroomIds },
    status: 'published',
    deletedAt: null,
  };
}

export async function list(req, res) {
  const { classroom: classroomId, status } = req.query;

  if (req.user.role === 'teacher') {
    const filter = { teacher: req.user.id, deletedAt: null };
    if (classroomId) {
      if (!(await ownedClassroom(req.user.id, classroomId))) {
        return forbidden(res, 'Only the classroom teacher can view its assignments.');
      }
      filter.classroom = classroomId;
    }
    if (status && ['draft', 'published', 'archived'].includes(status)) filter.status = status;

    // Deliberately no progress fields (FR-ASG-005).
    const assignments = await Assignment.find(filter)
      .populate('classroom', 'name subjectName status')
      .sort({ createdAt: -1 });

    return res.json({
      assignments: assignments.map((assignment) => ({
        ...assignment.toJSON(),
        classroomName: assignment.classroom?.name ?? '',
        classroomArchived: assignment.classroom?.status === 'archived',
      })),
      role: 'teacher',
    });
  }

  // Student: only assignments in classrooms with an active membership.
  const memberships = await ClassroomMember.find({ student: req.user.id, status: 'active' }).select(
    'classroom',
  );
  const classroomIds = memberships.map((membership) => membership.classroom);

  const filter = visibleStudentAssignmentFilter(classroomIds);
  if (classroomId) filter.classroom = classroomId;

  const assignments = await Assignment.find(filter)
    .populate('classroom', 'name subjectName teacher')
    .sort({ dueDate: 1, dueTime: 1 });

  const progressRecords = await AssignmentProgress.find({
    student: req.user.id,
    assignment: { $in: assignments.map((assignment) => assignment._id) },
  });
  const progressByAssignment = new Map(
    progressRecords.map((record) => [record.assignment.toString(), record]),
  );

  return res.json({
    assignments: assignments.map((assignment) => {
      const progress = progressByAssignment.get(assignment.id);
      return {
        ...assignment.toJSON(),
        classroomName: assignment.classroom?.name ?? '',
        subjectName: assignment.classroom?.subjectName ?? '',
        completed: progress?.completed ?? false,
        completedAt: progress?.completedAt ?? null,
        progressRevision: progress?.revision ?? 0,
      };
    }),
    role: 'student',
  });
}

export async function getOne(req, res) {
  const assignment = await Assignment.findOne({ _id: req.params.id, deletedAt: null }).populate(
    'classroom',
    'name subjectName teacher status academicTimezone',
  );
  if (!assignment) return notFound(res, 'Assignment not found.');

  if (req.user.role === 'teacher') {
    if (!assignment.teacher.equals(req.user.id)) {
      return forbidden(res, 'Only the authoring teacher can view this assignment.');
    }
    // No progress data is returned to teachers (FR-ASG-005).
    return res.json({
      assignment: {
        ...assignment.toJSON(),
        classroomName: assignment.classroom?.name ?? '',
      },
      role: 'teacher',
    });
  }

  // Student visibility requires published + active membership (FR-ASG-003).
  if (assignment.status !== 'published') {
    return notFound(res, 'Assignment not found.');
  }
  const membership = await activeMembership(req.user.id, assignment.classroom._id);
  if (!membership) return forbidden(res, 'You are not an active member of this classroom.');

  const progress = await AssignmentProgress.findOne({
    assignment: assignment._id,
    student: req.user.id,
  });

  return res.json({
    assignment: {
      ...assignment.toJSON(),
      classroomName: assignment.classroom?.name ?? '',
      subjectName: assignment.classroom?.subjectName ?? '',
      completed: progress?.completed ?? false,
      completedAt: progress?.completedAt ?? null,
      progressRevision: progress?.revision ?? 0,
    },
    role: 'student',
  });
}

export async function create(req, res) {
  const classroom = await ownedClassroom(req.user.id, req.body.classroom);
  if (!classroom) {
    return forbidden(res, 'Create assignments only for your own classrooms.');
  }
  if (!isValidDateKey(req.body.dueDate)) {
    return res.status(400).json({ code: 'INVALID_DATE', message: 'Due date is not a real calendar date.' });
  }
  if (req.body.dueTime && !isValidTime(req.body.dueTime)) {
    return res.status(400).json({ code: 'INVALID_TIME', message: 'Due time must be HH:mm.' });
  }

  const assignment = await Assignment.create({
    teacher: req.user.id,
    classroom: classroom._id,
    title: req.body.title,
    description: req.body.description ?? '',
    dueDate: req.body.dueDate,
    dueTime: req.body.dueTime ?? null,
    status: 'draft',
  });

  return res.status(201).json({ assignment: assignment.toJSON() });
}

async function teacherAssignment(req, res) {
  const assignment = await Assignment.findOne({ _id: req.params.id, deletedAt: null });
  if (!assignment) {
    notFound(res, 'Assignment not found.');
    return null;
  }
  if (!assignment.teacher.equals(req.user.id)) {
    forbidden(res, 'Only the authoring teacher can change this assignment.');
    return null;
  }
  return assignment;
}

export async function update(req, res) {
  const assignment = await teacherAssignment(req, res);
  if (!assignment) return undefined;

  if (req.body.dueDate !== undefined && !isValidDateKey(req.body.dueDate)) {
    return res.status(400).json({ code: 'INVALID_DATE', message: 'Due date is not a real calendar date.' });
  }
  if (req.body.dueTime && !isValidTime(req.body.dueTime)) {
    return res.status(400).json({ code: 'INVALID_TIME', message: 'Due time must be HH:mm.' });
  }

  // Editing never touches student progress documents (FR-ASG-006).
  for (const field of ['title', 'description', 'dueDate', 'dueTime']) {
    if (req.body[field] !== undefined) assignment[field] = req.body[field];
  }
  assignment.revision += 1;
  await assignment.save();
  return res.json({ assignment: assignment.toJSON() });
}

export async function publish(req, res) {
  const assignment = await teacherAssignment(req, res);
  if (!assignment) return undefined;

  if (assignment.status === 'published') {
    return res.json({ assignment: assignment.toJSON(), message: 'Assignment is already published.' });
  }
  assignment.status = 'published';
  assignment.publishedAt = new Date();
  assignment.revision += 1;
  await assignment.save();
  return res.json({ assignment: assignment.toJSON() });
}

export async function archive(req, res) {
  const assignment = await teacherAssignment(req, res);
  if (!assignment) return undefined;

  assignment.status = 'archived';
  assignment.revision += 1;
  await assignment.save();
  return res.json({ assignment: assignment.toJSON() });
}

/**
 * FR-ASG-007: soft-delete keeps the tombstone. Progress rows stay so stale
 * completion updates can be rejected later.
 */
export async function remove(req, res) {
  const assignment = await teacherAssignment(req, res);
  if (!assignment) return undefined;

  if (req.query.confirm !== 'true') {
    return conflict(
      res,
      'IMPACT_CONFIRMATION_REQUIRED',
      'Deleting an assignment hides it from students. Confirm to continue.',
      { impact: { assignmentTitle: assignment.title, status: assignment.status } },
    );
  }

  assignment.deletedAt = new Date();
  assignment.revision += 1;
  await assignment.save();
  return res.status(204).send();
}

/**
 * Student-only completion toggle — FR-ASG-004 / FR-ASG-007.
 *
 * Validates active membership, published state and non-deletion. Optional
 * `baseRevision` implements optimistic concurrency so stale offline updates
 * are rejected with 409 instead of overwriting newer state.
 */
export async function setProgress(req, res) {
  if (req.user.role !== 'student') {
    return forbidden(res, 'Only students track assignment completion.');
  }

  const assignment = await Assignment.findOne({ _id: req.params.id, deletedAt: null });
  if (!assignment || assignment.status !== 'published') {
    return notFound(res, 'Assignment not found.');
  }

  const membership = await activeMembership(req.user.id, assignment.classroom);
  if (!membership) {
    return forbidden(res, 'You are not an active member of this classroom.');
  }

  const { completed, baseRevision } = req.body;

  let progress = await AssignmentProgress.findOne({
    assignment: assignment._id,
    student: req.user.id,
  });

  if (!progress) {
    if (baseRevision !== undefined && baseRevision !== 0) {
      return conflict(res, 'STALE_PROGRESS', 'This record changed elsewhere. Refresh and try again.');
    }
    progress = await AssignmentProgress.create({
      assignment: assignment._id,
      student: req.user.id,
      completed,
      completedAt: completed ? new Date() : null,
      revision: 1,
    });
  } else {
    if (baseRevision !== undefined && baseRevision !== progress.revision) {
      return conflict(res, 'STALE_PROGRESS', 'This record changed elsewhere. Refresh and try again.');
    }
    progress.completed = completed;
    progress.completedAt = completed ? new Date() : null;
    progress.revision += 1;
    await progress.save();
  }

  return res.json({
    progress: {
      assignment: assignment.id,
      completed: progress.completed,
      completedAt: progress.completedAt,
      revision: progress.revision,
    },
  });
}
