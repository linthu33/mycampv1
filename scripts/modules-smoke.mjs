/**
 * End-to-end smoke test for the planner modules:
 * FR-SUB, FR-TASK, FR-CAL, FR-CLASS, FR-ASG, FR-NAV, FR-REM.
 *
 * Usage:
 *   node scripts/modules-smoke.mjs
 *
 * Requires the API running against MongoDB with EXPOSE_DEV_CODES=true.
 */

const BASE = process.env.API_BASE || 'http://127.0.0.1:4000/api';
const TZ = 'Asia/Yangon';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, body: json };
}

async function createUser(role, label) {
  const email = `${label}.${Date.now()}.${Math.floor(Math.random() * 9999)}@mycampus.dev`;
  const password = 'Campus12345';
  const registered = await call('POST', '/auth/register', {
    body: { fullName: `${label} User`, email, password, role },
  });
  if (registered.status !== 201) {
    throw new Error(`register failed: ${JSON.stringify(registered.body)}`);
  }
  const verified = await call('POST', '/auth/verify-email', {
    body: { email, code: registered.body.devCode },
  });
  if (verified.status !== 200) {
    throw new Error(`verify failed: ${JSON.stringify(verified.body)}`);
  }
  if (verified.body?.user?.timeFormat !== '12h') {
    throw new Error('default time format is not 12h');
  }
  return { token: verified.body.token, email, password, user: verified.body.user };
}

function dateKey(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = parts.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return base.toISOString().slice(0, 10);
}

async function run() {
  console.log(`\nMyCampus planner smoke test → ${BASE}\n`);

  const teacher = await createUser('teacher', 'plan.teacher');
  const student = await createUser('student', 'plan.student');

  // ------------------------------------------------------------- subjects
  console.log('Subjects (FR-SUB)');
  const createdSubject = await call('POST', '/subjects', {
    token: student.token,
    body: { name: 'Discrete Mathematics', code: 'csm-201', teacherName: 'Daw Hla', room: 'B-12' },
  });
  check('create subject returns 201', createdSubject.status === 201, JSON.stringify(createdSubject.body));
  const subject = createdSubject.body?.subject;
  check('subject code is stored uppercase', subject?.code === 'CSM-201');
  check('subject gets default purple', subject?.color === '#6236F5');

  const duplicateCode = await call('POST', '/subjects', {
    token: student.token,
    body: { name: 'Another', code: 'CSM-201' },
  });
  check(
    'duplicate code rejected case-insensitively',
    duplicateCode.status === 409 && duplicateCode.body?.code === 'SUBJECT_CODE_TAKEN',
    JSON.stringify(duplicateCode.body),
  );

  const badCode = await call('POST', '/subjects', {
    token: student.token,
    body: { name: 'Bad', code: 'A B' },
  });
  check('invalid characters in code rejected', badCode.status === 400);

  const secondSubject = await call('POST', '/subjects', {
    token: student.token,
    body: { name: 'Physics', code: 'PHY-101' },
  });
  check('second subject created', secondSubject.status === 201);
  const physics = secondSubject.body?.subject;

  const subjectList = await call('GET', '/subjects', { token: student.token });
  check('student lists own subjects', subjectList.body?.subjects?.length === 2);

  const teacherSubjects = await call('GET', '/subjects', { token: teacher.token });
  check('subjects are owner-scoped', teacherSubjects.body?.subjects?.length === 0);

  const updatedSubject = await call('PATCH', `/subjects/${subject.id}`, {
    token: student.token,
    body: { room: 'B-14' },
  });
  check('subject update succeeds', updatedSubject.status === 200 && updatedSubject.body?.subject?.room === 'B-14');

  // --------------------------------------------- tasks tied to a subject
  console.log('Tasks (FR-TASK)');
  const task1 = await call('POST', '/tasks', {
    token: student.token,
    body: {
      title: 'Finish problem set',
      subject: subject.id,
      priority: 'high',
      dueDate: dateKey(1),
      dueTime: '18:00',
      reminderMinutesBefore: 60,
    },
  });
  check('create task returns 201', task1.status === 201, JSON.stringify(task1.body));
  const firstTask = task1.body?.task;
  check('task keeps subject reference', firstTask?.subject?.code === 'CSM-201');
  check('default status is pending', firstTask?.status === 'pending');

  const undatedTask = await call('POST', '/tasks', {
    token: student.token,
    body: { title: 'Buy notebook', subject: physics.id },
  });
  check('undated task allowed', undatedTask.status === 201 && undatedTask.body?.task?.dueDate === null);

  const generalTask = await call('POST', '/tasks', {
    token: student.token,
    body: { title: 'General errand' },
  });
  check('general task without subject allowed', generalTask.status === 201);

  const implicitGeneral = await call('POST', '/tasks', {
    token: student.token,
    body: { title: 'Implicit general', subject: '' },
  });
  check('empty subject string becomes General', implicitGeneral.status === 201);

  const foreignSubject = await call('POST', '/tasks', {
    token: teacher.token,
    body: { title: 'Stolen', subject: subject.id },
  });
  check('cannot attach another user\'s subject', foreignSubject.status === 400);

  const badDate = await call('POST', '/tasks', {
    token: student.token,
    body: { title: 'Bad date', dueDate: '2026-02-31' },
  });
  check('impossible calendar date rejected', badDate.status === 400);

  const pendingList = await call('GET', '/tasks?status=pending&sort=priority&order=desc', {
    token: student.token,
  });
  check('task list counts reported', pendingList.body?.counts?.all >= 4);
  check('pending filter includes only pending', pendingList.body?.tasks?.every((task) => task.status === 'pending'));
  check(
    'priority sort desc puts high last',
    pendingList.body?.tasks?.at(-1)?.priority === 'high',
    JSON.stringify(pendingList.body?.tasks?.map((task) => task.priority)),
  );

  const search = await call('GET', '/tasks?q=notebook', { token: student.token });
  check('title search works', search.body?.tasks?.length === 1);

  const generalOnly = await call('GET', '/tasks?subject=general', { token: student.token });
  check(
    'subject=general filter only returns null subjects',
    generalOnly.body?.tasks?.every((task) => task.subject === null),
  );

  const complete = await call('PATCH', `/tasks/${firstTask.id}`, {
    token: student.token,
    body: { status: 'completed', subject: null },
  });
  check('task completion succeeds', complete.status === 200 && complete.body?.task?.status === 'completed');
  check('completedAt recorded', typeof complete.body?.task?.completedAt === 'string');
  check('task moved to General', complete.body?.task?.subject === null);

  const reopened = await call('PATCH', `/tasks/${firstTask.id}`, {
    token: student.token,
    body: { status: 'pending' },
  });
  check('completion is reversible', reopened.body?.task?.status === 'pending' && reopened.body?.task?.completedAt === null);

  const otherUsersTask = await call('PATCH', `/tasks/${firstTask.id}`, {
    token: teacher.token,
    body: { title: 'Hijack' },
  });
  check('tasks are owner-only', otherUsersTask.status === 404);

  const deletedTask = await call('DELETE', `/tasks/${undatedTask.body.task.id}`, { token: student.token });
  check('task soft delete returns 204', deletedTask.status === 204);
  const afterDelete = await call('GET', '/tasks', { token: student.token });
  check(
    'deleted task disappears from lists',
    !afterDelete.body?.tasks?.some((task) => task.id === undatedTask.body.task.id),
  );

  // --------------------------------------------- subject delete impact
  console.log('Subject delete impact (FR-SUB-004)');
  const impact = await call('GET', `/subjects/${physics.id}/impact`, { token: student.token });
  check('impact reports affected tasks', impact.body?.impact?.tasksMovedToGeneral === 0);

  const blockedDelete = await call('DELETE', `/subjects/${subject.id}`, { token: student.token });
  check(
    'delete without confirm returns 409',
    blockedDelete.status === 409 && blockedDelete.body?.code === 'IMPACT_CONFIRMATION_REQUIRED',
    JSON.stringify(blockedDelete.body),
  );

  const confirmedDelete = await call('DELETE', `/subjects/${subject.id}?confirm=true`, {
    token: student.token,
  });
  check('confirmed delete succeeds', confirmedDelete.status === 200, JSON.stringify(confirmedDelete.body));

  const tasksAfterSubjectDelete = await call('GET', '/tasks?subject=general', { token: student.token });
  check(
    'tasks survive subject deletion as General Tasks',
    tasksAfterSubjectDelete.body?.tasks?.some((task) => task.title === 'Finish problem set'),
  );

  // ------------------------------------------------------------- events
  console.log('Events (FR-CAL-002/003)');
  const event = await call('POST', '/events', {
    token: student.token,
    body: {
      title: 'Algorithms midterm',
      type: 'exam',
      date: dateKey(2),
      startTime: '09:00',
      endTime: '11:00',
      location: 'Hall A',
      reminderMinutesBefore: 120,
    },
  });
  check('create event returns 201', event.status === 201, JSON.stringify(event.body));

  const badEventTime = await call('POST', '/events', {
    token: student.token,
    body: { title: 'Bad', type: 'other', date: dateKey(2), startTime: '11:00', endTime: '09:00' },
  });
  check('event end before start rejected', badEventTime.status === 400);

  const rangeEvents = await call('GET', `/events?from=${dateKey(1)}&to=${dateKey(3)}`, {
    token: student.token,
  });
  check('event range query returns the event', rangeEvents.body?.events?.length === 1);

  const updatedEvent = await call('PATCH', `/events/${event.body.event.id}`, {
    token: student.token,
    body: { location: 'Hall B' },
  });
  check('event update succeeds', updatedEvent.body?.event?.location === 'Hall B');

  // ---------------------------------------------------------- timetable
  console.log('Timetable (FR-CAL-005/006)');
  const entry = await call('POST', '/timetable', {
    token: student.token,
    body: { subject: physics.id, weekday: 1, startTime: '09:00', endTime: '10:00', room: 'B-12' },
  });
  check('create timetable entry returns 201', entry.status === 201, JSON.stringify(entry.body));
  check('first entry has no overlap warnings', Array.isArray(entry.body?.warnings) && entry.body.warnings.length === 0);

  const overlapping = await call('POST', '/timetable', {
    token: student.token,
    body: { subject: physics.id, weekday: 1, startTime: '09:30', endTime: '10:30' },
  });
  check('overlap produces a warning', overlapping.body?.warnings?.length === 1, JSON.stringify(overlapping.body?.warnings));

  const reversedTimes = await call('POST', '/timetable', {
    token: student.token,
    body: { subject: physics.id, weekday: 2, startTime: '10:00', endTime: '09:00' },
  });
  check('end before start rejected', reversedTimes.status === 400);

  const weekdayFilter = await call('GET', '/timetable?weekday=1', { token: student.token });
  check('weekday filter returns Monday entries', weekdayFilter.body?.entries?.length === 2);

  const removedEntry = await call('DELETE', `/timetable/${overlapping.body.entry.id}`, {
    token: student.token,
  });
  check('timetable entry soft delete', removedEntry.status === 204);

  // --------------------------------------------------------- classrooms
  console.log('Classrooms (FR-CLASS)');
  const classroom = await call('POST', '/classrooms', {
    token: teacher.token,
    body: { name: 'CS-201 Section A', subjectName: 'Discrete Mathematics', description: 'Mon/Wed' },
  });
  check('teacher creates classroom', classroom.status === 201, JSON.stringify(classroom.body));
  const klass = classroom.body?.classroom;
  check('join code is 6 characters', typeof klass?.joinCode === 'string' && klass.joinCode.length === 6);
  check('classroom inherits teacher timezone', klass?.academicTimezone === TZ);

  const studentCreate = await call('POST', '/classrooms', {
    token: student.token,
    body: { name: 'Not allowed', subjectName: 'X' },
  });
  check('students cannot create classrooms', studentCreate.status === 403);

  const join = await call('POST', '/classrooms/join', {
    token: student.token,
    body: { code: klass.joinCode.toLowerCase() },
  });
  check('student joins by code (case-insensitive)', join.status === 201 && join.body?.membership?.status === 'active', JSON.stringify(join.body));

  const joinAgain = await call('POST', '/classrooms/join', {
    token: student.token,
    body: { code: klass.joinCode },
  });
  check('re-joining active classroom is idempotent', joinAgain.status === 200 && joinAgain.body?.rejoined === false);

  const teacherJoin = await call('POST', '/classrooms/join', {
    token: teacher.token,
    body: { code: klass.joinCode },
  });
  check('teachers cannot join by code', teacherJoin.status === 403);

  const studentClassrooms = await call('GET', '/classrooms', { token: student.token });
  check(
    'student lists joined classrooms',
    studentClassrooms.body?.classrooms?.length === 1 && studentClassrooms.body.classrooms[0].role === 'student',
  );

  const memberList = await call('GET', `/classrooms/${klass.id}/members`, { token: teacher.token });
  check('teacher sees members', memberList.body?.members?.length === 1);
  const memberId = memberList.body?.members?.[0]?.id;
  check('member payload includes student name', Boolean(memberList.body?.members?.[0]?.studentName));

  const studentMembers = await call('GET', `/classrooms/${klass.id}/members`, { token: student.token });
  check('students cannot list members', studentMembers.status === 403);

  const remove = await call('DELETE', `/classrooms/${klass.id}/members/${memberId}`, {
    token: teacher.token,
  });
  check('teacher removes member and blocks rejoin', remove.body?.member?.rejoinBlocked === true);

  const blockedRejoin = await call('POST', '/classrooms/join', {
    token: student.token,
    body: { code: klass.joinCode },
  });
  check('removed student cannot rejoin', blockedRejoin.status === 403);

  await call('POST', `/classrooms/${klass.id}/members/${memberId}/unblock`, { token: teacher.token });
  const rejoin = await call('POST', '/classrooms/join', {
    token: student.token,
    body: { code: klass.joinCode },
  });
  check('unblocked student can rejoin', rejoin.status === 200 && rejoin.body?.rejoined === true);

  const leave = await call('POST', `/classrooms/${klass.id}/leave`, { token: student.token });
  check('student can leave', leave.status === 200 && leave.body?.membership?.status === 'left');

  const leaveAgain = await call('POST', `/classrooms/${klass.id}/leave`, { token: student.token });
  check('leaving twice rejected', leaveAgain.status === 400);

  const rejoinAfterLeave = await call('POST', '/classrooms/join', {
    token: student.token,
    body: { code: klass.joinCode },
  });
  check('student can rejoin after voluntary leave', rejoinAfterLeave.body?.rejoined === true);

  const events = await call('GET', `/classrooms/${klass.id}/events`, { token: teacher.token });
  const eventTypes = new Set((events.body?.events ?? []).map((item) => item.type));
  check('audit trail records join/leave/remove/unblock', ['join', 'remove', 'unblock', 'leave'].every((type) => eventTypes.has(type)));

  const studentEvents = await call('GET', `/classrooms/${klass.id}/events`, { token: student.token });
  check(
    'students see only their own events',
    studentEvents.body?.events?.every((item) => item.studentName === student.user.fullName || item.student === student.user.id),
  );

  const reset = await call('POST', `/classrooms/${klass.id}/reset-code`, { token: teacher.token });
  check('join code reset rotates the code', reset.body?.classroom?.joinCode && reset.body.classroom.joinCode !== klass.joinCode);

  const secondClassroom = await call('POST', '/classrooms', {
    token: teacher.token,
    body: { name: 'Archive test', subjectName: 'Physics' },
  });
  await call('POST', `/classrooms/${secondClassroom.body.classroom.id}/archive`, { token: teacher.token });
  const archivedJoin = await call('POST', '/classrooms/join', {
    token: student.token,
    body: { code: secondClassroom.body.classroom.joinCode },
  });
  check(
    'archived classroom rejects joins',
    archivedJoin.status === 409 && archivedJoin.body?.code === 'CLASSROOM_ARCHIVED',
  );

  // --------------------------------------------------------- assignments
  console.log('Assignments (FR-ASG)');
  const draft = await call('POST', '/assignments', {
    token: teacher.token,
    body: {
      classroom: klass.id,
      title: 'Graph theory worksheet',
      description: 'Chapters 1-3',
      dueDate: dateKey(3),
      dueTime: '17:00',
    },
  });
  check('teacher creates a draft', draft.status === 201 && draft.body?.assignment?.status === 'draft', JSON.stringify(draft.body));
  const assignmentId = draft.body?.assignment?.id;

  const studentDraftList = await call('GET', '/assignments', { token: student.token });
  check('draft assignments hidden from students', !studentDraftList.body?.assignments?.some((item) => item.id === assignmentId));

  const otherStudent = await createUser('student', 'plan.outsider');
  const outsiderList = await call('GET', '/assignments', { token: otherStudent.token });
  check('non-members see no classroom assignments', outsiderList.body?.assignments?.length === 0);

  await call('POST', `/assignments/${assignmentId}/publish`, { token: teacher.token });
  const studentPublishedList = await call('GET', '/assignments', { token: student.token });
  const published = studentPublishedList.body?.assignments?.find((item) => item.id === assignmentId);
  check('published assignment visible to active member', Boolean(published));
  check('student list exposes own progress defaults', published?.completed === false && published?.progressRevision === 0);
  check(
    'teacher list never contains progress fields',
    (await call('GET', '/assignments', { token: teacher.token })).body?.assignments?.every(
      (item) => item.completed === undefined && item.progress === undefined && item.progressRevision === undefined,
    ),
  );

  const outsiderProgress = await call('PATCH', `/assignments/${assignmentId}/progress`, {
    token: otherStudent.token,
    body: { completed: true },
  });
  check('non-member cannot update progress', outsiderProgress.status === 403);

  const teacherProgress = await call('PATCH', `/assignments/${assignmentId}/progress`, {
    token: teacher.token,
    body: { completed: true },
  });
  check('teachers cannot set student progress', teacherProgress.status === 403);

  const progress = await call('PATCH', `/assignments/${assignmentId}/progress`, {
    token: student.token,
    body: { completed: true, baseRevision: 0 },
  });
  check('student marks completion', progress.status === 200 && progress.body?.progress?.completed === true);
  const progressRevision = progress.body?.progress?.revision;
  check('progress revision increments', progressRevision === 1);

  const stale = await call('PATCH', `/assignments/${assignmentId}/progress`, {
    token: student.token,
    body: { completed: false, baseRevision: 99 },
  });
  check('stale progress update rejected with 409', stale.status === 409 && stale.body?.code === 'STALE_PROGRESS');

  const teacherEdit = await call('PATCH', `/assignments/${assignmentId}`, {
    token: teacher.token,
    body: { title: 'Graph theory worksheet (revised)' },
  });
  check('teacher edits assignment', teacherEdit.status === 200);

  const afterEdit = await call('GET', '/assignments', { token: student.token });
  const stillComplete = afterEdit.body?.assignments?.find((item) => item.id === assignmentId);
  check('teacher edits preserve student completion', stillComplete?.completed === true);

  const archiveAssignment = await call('POST', `/assignments/${assignmentId}/archive`, {
    token: teacher.token,
  });
  check('assignment archive succeeds', archiveAssignment.body?.assignment?.status === 'archived');
  const afterArchive = await call('GET', '/assignments', { token: student.token });
  check('archived assignment hidden from students', !afterArchive.body?.assignments?.some((item) => item.id === assignmentId));

  const staleCompletion = await call('PATCH', `/assignments/${assignmentId}/progress`, {
    token: student.token,
    body: { completed: false, baseRevision: progressRevision },
  });
  check('archived assignment rejects completion updates', staleCompletion.status === 404);

  const deleteUnconfirmed = await call('DELETE', `/assignments/${assignmentId}`, { token: teacher.token });
  check('assignment delete requires confirmation', deleteUnconfirmed.status === 409);

  const deletedAssignment = await call('DELETE', `/assignments/${assignmentId}?confirm=true`, {
    token: teacher.token,
  });
  check('confirmed assignment soft delete', deletedAssignment.status === 204);

  // ---------------------------------------------------------- dashboard
  console.log('Dashboard (FR-NAV-003/004/005)');
  await call('POST', '/tasks', {
    token: student.token,
    body: { title: 'Overdue essay', dueDate: dateKey(-1) },
  });
  await call('POST', '/tasks', {
    token: student.token,
    body: { title: 'Due soon reading', dueDate: dateKey(0) },
  });
  await call('POST', '/tasks', {
    token: student.token,
    body: { title: 'Later revision', dueDate: dateKey(6) },
  });
  // Schedule today so the dashboard has a same-day timetable entry.
  const todayWeekday = ((new Date().getUTCDay() + 6) % 7) + 1;
  await call('POST', '/timetable', {
    token: student.token,
    body: { subject: physics.id, weekday: todayWeekday, startTime: '08:00', endTime: '09:00' },
  });

  const studentHome = await call('GET', '/dashboard', { token: student.token });
  check('student dashboard responds', studentHome.status === 200);
  check('dashboard includes today in academic timezone', studentHome.body?.today === dateKey(0));
  check('dashboard includes time format', studentHome.body?.timeFormat === '12h');
  check('dashboard includes subjects', Array.isArray(studentHome.body?.subjects));
  check('dashboard includes joined classrooms', studentHome.body?.classrooms?.length === 1);
  check('dashboard includes today\'s schedule', studentHome.body?.schedule?.length === 1);
  check('dashboard includes pending tasks', studentHome.body?.pendingTasks?.length >= 3);

  const deadlines = studentHome.body?.deadlines ?? [];
  check('deadlines exclude undated tasks', deadlines.length >= 3 && deadlines.every((item) => item.dueDate));
  check(
    'deadlines sorted nearest first',
    deadlines.every((item, index) => index === 0 || deadlines[index - 1].deadline <= item.deadline),
  );
  check(
    'overdue deadline is flagged',
    deadlines.some((item) => item.title === 'Overdue essay' && item.overdue === true),
  );
  check(
    'future deadline is not flagged overdue',
    deadlines.some((item) => item.title === 'Later revision' && item.overdue === false),
  );

  const day = await call('GET', `/dashboard/schedule?date=${dateKey(0)}`, { token: student.token });
  check('day schedule responds', day.status === 200 && day.body?.date === dateKey(0));
  check('day schedule lists day tasks', day.body?.tasks?.length >= 1);

  const teacherHome = await call('GET', '/dashboard', { token: teacher.token });
  check('teacher dashboard includes classrooms', teacherHome.body?.classrooms?.length === 2);
  check('teacher dashboard includes quick actions', Array.isArray(teacherHome.body?.quickActions));
  check(
    'teacher dashboard never exposes progress',
    teacherHome.body?.publishedAssignments?.every((item) => item.completed === undefined) &&
      teacherHome.body?.deadlines?.every((item) => item.kind !== 'assignment'),
  );

  // ---------------------------------------------------------- reminders
  console.log('Reminders (FR-REM-002/004)');
  await call('POST', '/events', {
    token: student.token,
    body: {
      title: 'Reminder event',
      type: 'seminar',
      date: dateKey(0),
      startTime: '22:00',
      reminderMinutesBefore: 30,
    },
  });

  const reminders = await call('GET', '/reminders', { token: student.token });
  check('reminders respond', reminders.status === 200);
  check('reminder counts present', typeof reminders.body?.counts?.total === 'number');
  check('overdue bucket contains yesterday task', reminders.body?.overdue?.some((item) => item.title === 'Overdue essay'));
  check('due soon bucket contains today task', reminders.body?.dueSoon?.some((item) => item.title === 'Due soon reading'));
  check('upcoming bucket contains later task', reminders.body?.upcoming?.some((item) => item.title === 'Later revision'));
  check(
    'date-only deadlines resolve to end of day',
    reminders.body?.dueSoon?.some((item) => item.dueDate === dateKey(0) && item.deadline.endsWith('Z')),
  );
  const allReminders = [
    ...(reminders.body?.dueSoon ?? []),
    ...(reminders.body?.overdue ?? []),
    ...(reminders.body?.upcoming ?? []),
  ];
  const eventReminder = allReminders.find(
    (item) => item.kind === 'event' && item.title === 'Reminder event',
  );
  check(
    'event reminders use the event date and start time',
    eventReminder?.dueDate === dateKey(0) && eventReminder?.dueTime === '22:00',
    JSON.stringify(eventReminder),
  );

  const teacherReminders = await call('GET', '/reminders', { token: teacher.token });
  check(
    'teacher reminders never include assignment progress',
    teacherReminders.body?.dueSoon?.concat(teacherReminders.body?.overdue ?? []).every((item) => item.kind !== 'assignment'),
  );

  // --------------------------------------------------------- time format
  console.log('Profile time format (FR-CAL-004)');
  const timeFormat = await call('PATCH', '/auth/profile', {
    token: student.token,
    body: { timeFormat: '24h' },
  });
  check('time format updates', timeFormat.status === 200 && timeFormat.body?.user?.timeFormat === '24h');
  const invalidFormat = await call('PATCH', '/auth/profile', {
    token: student.token,
    body: { timeFormat: 'military' },
  });
  check('invalid time format rejected', invalidFormat.status === 400);

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

run().catch((err) => {
  console.error('\nPlanner smoke test crashed:', err);
  process.exitCode = 1;
});
