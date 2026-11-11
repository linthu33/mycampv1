import Classroom from '../models/classroom.model.js';
import ClassroomMember from '../models/classroom_member.model.js';
import MembershipEvent from '../models/membership_event.model.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/http.js';
import { generateJoinCode } from '../utils/joinCode.js';

/**
 * Classrooms and membership — FR-CLASS-001..011.
 *
 * All membership administration is teacher-authoritative. Students can only
 * join by code, leave, and read their own membership events. Classroom
 * operations are online-only by product design (FR-CLASS-011).
 */

async function newUniqueJoinCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateJoinCode(6);
    // eslint-disable-next-line no-await-in-loop
    const exists = await Classroom.exists({ joinCode: code });
    if (!exists) return code;
  }
  throw new Error('Could not allocate a unique join code.');
}

async function teacherClassroom(req, res, withMembers = false) {
  const classroom = await Classroom.findOne({ _id: req.params.id, teacher: req.user.id });
  if (!classroom) {
    forbidden(res, 'Only the classroom teacher can perform this action.');
    return null;
  }
  if (withMembers) await classroom.populate('teacher', 'fullName email');
  return classroom;
}

function recordEvent({ classroom, membership = null, actor, student = null, type, note = '' }) {
  return MembershipEvent.create({ classroom, membership, actor, student, type, note });
}

export async function create(req, res) {
  const joinCode = await newUniqueJoinCode();

  const classroom = await Classroom.create({
    teacher: req.user.id,
    name: req.body.name,
    subjectName: req.body.subjectName,
    description: req.body.description ?? '',
    joinCode,
    // FR-CLASS-010: captured from the teacher profile at creation, immutable.
    academicTimezone: req.user.academicTimezone,
  });

  return res.status(201).json({ classroom: classroom.toJSON() });
}

export async function list(req, res) {
  if (req.user.role === 'teacher') {
    const classrooms = await Classroom.find({ teacher: req.user.id }).sort({ createdAt: -1 });
    const withCounts = await Promise.all(
      classrooms.map(async (classroom) => {
        const memberCount = await ClassroomMember.countDocuments({
          classroom: classroom._id,
          status: 'active',
        });
        return { ...classroom.toJSON(), memberCount, role: 'teacher' };
      }),
    );
    return res.json({ classrooms: withCounts });
  }

  const memberships = await ClassroomMember.find({ student: req.user.id, status: 'active' })
    .populate({
      path: 'classroom',
      populate: { path: 'teacher', select: 'fullName' },
    })
    .sort({ updatedAt: -1 });

  const classrooms = memberships
    .filter((membership) => membership.classroom)
    .map((membership) => ({
      ...membership.classroom.toJSON(),
      role: 'student',
      membershipId: membership.id,
      membershipStatus: membership.status,
      teacherName: membership.classroom.teacher?.fullName ?? 'Teacher',
      joinedAt: membership.joinedAt,
    }));

  return res.json({ classrooms });
}

export async function getOne(req, res) {
  const classroom = await Classroom.findById(req.params.id).populate('teacher', 'fullName email');
  if (!classroom) return notFound(res, 'Classroom not found.');

  const isTeacher = classroom.teacher._id.equals(req.user.id);
  const membership = await ClassroomMember.findOne({
    classroom: classroom._id,
    student: req.user.id,
  });

  if (!isTeacher && (!membership || membership.status !== 'active')) {
    return forbidden(res, 'Join this classroom first.');
  }

  const memberCount = await ClassroomMember.countDocuments({
    classroom: classroom._id,
    status: 'active',
  });

  return res.json({
    classroom: {
      ...classroom.toJSON(),
      teacherName: classroom.teacher.fullName,
      role: isTeacher ? 'teacher' : 'student',
      memberCount,
      membership: membership ? membership.toJSON() : null,
    },
  });
}

export async function update(req, res) {
  const classroom = await teacherClassroom(req, res);
  if (!classroom) return undefined;

  for (const field of ['name', 'subjectName', 'description']) {
    if (req.body[field] !== undefined) classroom[field] = req.body[field];
  }
  await classroom.save();
  return res.json({ classroom: classroom.toJSON() });
}

export async function archive(req, res) {
  const classroom = await teacherClassroom(req, res);
  if (!classroom) return undefined;

  if (classroom.status === 'archived') {
    return res.json({ classroom: classroom.toJSON(), message: 'Classroom is already archived.' });
  }

  classroom.status = 'archived';
  classroom.archivedAt = new Date();
  await classroom.save();
  await recordEvent({
    classroom: classroom._id,
    actor: req.user.id,
    type: 'archive',
    note: 'Classroom archived; new joins are rejected.',
  });

  return res.json({ classroom: classroom.toJSON() });
}

export async function resetCode(req, res) {
  const classroom = await teacherClassroom(req, res);
  if (!classroom) return undefined;

  classroom.joinCode = await newUniqueJoinCode();
  await classroom.save();
  await recordEvent({
    classroom: classroom._id,
    actor: req.user.id,
    type: 'code_reset',
    note: 'Join code rotated.',
  });

  return res.json({ classroom: classroom.toJSON() });
}

export async function members(req, res) {
  const classroom = await teacherClassroom(req, res);
  if (!classroom) return undefined;

  const records = await ClassroomMember.find({ classroom: classroom._id })
    .populate('student', 'fullName email role')
    .sort({ status: 1, createdAt: 1 });

  return res.json({
    members: records.map((record) => ({
      ...record.toJSON(),
      studentName: record.student?.fullName ?? 'Unknown student',
      studentEmail: record.student?.email ?? '',
    })),
  });
}

export async function removeMember(req, res) {
  const classroom = await teacherClassroom(req, res);
  if (!classroom) return undefined;

  const record = await ClassroomMember.findOne({
    _id: req.params.memberId,
    classroom: classroom._id,
  });
  if (!record) return notFound(res, 'Membership not found.');
  if (record.status === 'removed' && record.rejoinBlocked) {
    return res.json({ member: record.toJSON(), message: 'Student is already removed and blocked.' });
  }

  record.status = 'removed';
  // FR-CLASS-005: removal blocks rejoining until the teacher unblocks.
  record.rejoinBlocked = true;
  record.endedAt = new Date();
  await record.save();
  await recordEvent({
    classroom: classroom._id,
    membership: record._id,
    actor: req.user.id,
    student: record.student,
    type: 'remove',
    note: 'Student removed and blocked from rejoining.',
  });

  return res.json({ member: record.toJSON() });
}

export async function unblockMember(req, res) {
  const classroom = await teacherClassroom(req, res);
  if (!classroom) return undefined;

  const record = await ClassroomMember.findOne({
    _id: req.params.memberId,
    classroom: classroom._id,
  });
  if (!record) return notFound(res, 'Membership not found.');

  // FR-CLASS-005: unblocking permits a future join but does not rejoin.
  record.rejoinBlocked = false;
  await record.save();
  await recordEvent({
    classroom: classroom._id,
    membership: record._id,
    actor: req.user.id,
    student: record.student,
    type: 'unblock',
    note: 'Student may rejoin with the current code; membership stays inactive.',
  });

  return res.json({ member: record.toJSON() });
}

export async function events(req, res) {
  const classroom = await Classroom.findById(req.params.id);
  if (!classroom) return notFound(res, 'Classroom not found.');

  const isTeacher = classroom.teacher.equals(req.user.id);
  const filter = { classroom: classroom._id };
  if (!isTeacher) {
    const membership = await ClassroomMember.findOne({
      classroom: classroom._id,
      student: req.user.id,
    });
    if (!membership) return forbidden(res, 'You are not a member of this classroom.');
    // FR-CLASS-008: students see only their own membership events.
    filter.student = req.user.id;
  }

  const records = await MembershipEvent.find(filter)
    .populate('actor', 'fullName role')
    .populate('student', 'fullName')
    .sort({ createdAt: -1 })
    .limit(200);

  return res.json({
    events: records.map((record) => ({
      ...record.toJSON(),
      actorName: record.actor?.fullName ?? 'Unknown',
      actorRole: record.actor?.role ?? '',
      studentName: record.student?.fullName ?? '',
    })),
  });
}

export async function join(req, res) {
  if (req.user.role !== 'student') {
    return forbidden(res, 'Only student accounts can join classrooms by code.');
  }

  const classroom = await Classroom.findOne({ joinCode: req.body.code });
  if (!classroom) {
    return badRequest(res, 'INVALID_JOIN_CODE', 'No classroom uses that join code.');
  }
  // FR-CLASS-007: archived classrooms reject new joins.
  if (classroom.status === 'archived') {
    return conflict(res, 'CLASSROOM_ARCHIVED', 'This classroom is archived and no longer accepts joins.');
  }

  const existing = await ClassroomMember.findOne({
    classroom: classroom._id,
    student: req.user.id,
  });

  if (existing) {
    if (existing.rejoinBlocked) {
      return forbidden(res, 'The teacher removed you from this classroom. Ask them to unblock you first.');
    }
    if (existing.status === 'active') {
      return res.json({ classroom: classroom.toJSON(), membership: existing.toJSON(), rejoined: false });
    }
    // FR-CLASS-004: voluntary leave can rejoin with the current code.
    existing.status = 'active';
    existing.joinedAt = new Date();
    existing.endedAt = null;
    await existing.save();
    await recordEvent({
      classroom: classroom._id,
      membership: existing._id,
      actor: req.user.id,
      student: req.user.id,
      type: 'join',
      note: 'Student rejoined.',
    });
    return res.json({ classroom: classroom.toJSON(), membership: existing.toJSON(), rejoined: true });
  }

  const membership = await ClassroomMember.create({
    classroom: classroom._id,
    student: req.user.id,
    status: 'active',
    joinedAt: new Date(),
  });
  await recordEvent({
    classroom: classroom._id,
    membership: membership._id,
    actor: req.user.id,
    student: req.user.id,
    type: 'join',
    note: 'Student joined.',
  });

  return res.status(201).json({ classroom: classroom.toJSON(), membership: membership.toJSON(), rejoined: false });
}

export async function leave(req, res) {
  const classroom = await Classroom.findById(req.params.id);
  if (!classroom) return notFound(res, 'Classroom not found.');

  const record = await ClassroomMember.findOne({
    classroom: classroom._id,
    student: req.user.id,
  });
  if (!record || record.status !== 'active') {
    return badRequest(res, 'NOT_A_MEMBER', 'You are not an active member of this classroom.');
  }

  record.status = 'left';
  record.endedAt = new Date();
  await record.save();
  await recordEvent({
    classroom: classroom._id,
    membership: record._id,
    actor: req.user.id,
    student: req.user.id,
    type: 'leave',
    note: 'Student left voluntarily.',
  });

  return res.json({ membership: record.toJSON() });
}
