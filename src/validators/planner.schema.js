import { z } from 'zod';

const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid record id.');

export const objectIdSchema = objectId;

const optionalText = (max) => z.string().trim().max(max).optional();

const dateKey = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.');

const timeKey = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a HH:mm time.');

const nullableDate = z
  .union([dateKey, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === '' || value === undefined ? value : value === null ? null : value));

const nullableTime = z
  .union([timeKey, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === '' ? null : value));

const reminder = z.union([z.number().int().min(0).max(10080), z.null()]).optional();

// ---------------------------------------------------------------- subjects
export const subjectCreateSchema = z.object({
  name: z.string().trim().min(1, 'Subject name is required.').max(120),
  code: z
    .string()
    .trim()
    .min(1, 'Subject code is required.')
    .max(16)
    .regex(/^[A-Za-z0-9._-]+$/, 'Codes may use letters, numbers, dot, dash and underscore.')
    .transform((value) => value.toUpperCase()),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #6236F5.')
    .optional(),
  teacherName: optionalText(120),
  room: optionalText(60),
});

export const subjectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    code: z
      .string()
      .trim()
      .min(1)
      .max(16)
      .regex(/^[A-Za-z0-9._-]+$/, 'Codes may use letters, numbers, dot, dash and underscore.')
      .transform((value) => value.toUpperCase())
      .optional(),
    color: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #6236F5.')
      .optional(),
    teacherName: optionalText(120),
    room: optionalText(60),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field.' });

// ------------------------------------------------------------------- tasks
const taskFields = {
  title: z.string().trim().min(1, 'Task title is required.').max(160),
  description: z.string().trim().max(2000).optional(),
  subject: z.union([objectId, z.literal(''), z.null()]).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['pending', 'completed']).optional(),
  dueDate: nullableDate,
  dueTime: nullableTime,
  reminderMinutesBefore: reminder,
};

export const taskCreateSchema = z.object(taskFields);

export const taskUpdateSchema = z
  .object({
    title: taskFields.title.optional(),
    description: taskFields.description,
    subject: taskFields.subject,
    priority: taskFields.priority,
    status: taskFields.status,
    dueDate: taskFields.dueDate,
    dueTime: taskFields.dueTime,
    reminderMinutesBefore: taskFields.reminderMinutesBefore,
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field.' });

// ------------------------------------------------------------------ events
export const eventCreateSchema = z.object({
  title: z.string().trim().min(1, 'Event title is required.').max(160),
  type: z.enum(['exam', 'meeting', 'seminar', 'study_session', 'other']).optional(),
  date: dateKey,
  startTime: nullableTime,
  endTime: nullableTime,
  description: z.string().trim().max(2000).optional(),
  location: optionalText(160),
  reminderMinutesBefore: reminder,
});

export const eventUpdateSchema = eventCreateSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field.' });

// --------------------------------------------------------------- timetable
export const timetableCreateSchema = z.object({
  subject: objectId,
  weekday: z.number().int().min(1).max(5),
  startTime: timeKey,
  endTime: timeKey,
  room: optionalText(60),
});

export const timetableUpdateSchema = timetableCreateSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field.' });

// -------------------------------------------------------------- classrooms
export const classroomCreateSchema = z.object({
  name: z.string().trim().min(1, 'Classroom name is required.').max(120),
  subjectName: z.string().trim().min(1, 'Subject name is required.').max(120),
  description: z.string().trim().max(1000).optional(),
});

export const classroomUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    subjectName: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field.' });

export const joinClassroomSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, 'Enter the classroom join code.')
    .max(12)
    .transform((value) => value.toUpperCase()),
});

// ------------------------------------------------------------- assignments
export const assignmentCreateSchema = z.object({
  classroom: objectId,
  title: z.string().trim().min(1, 'Assignment title is required.').max(160),
  description: z.string().trim().max(4000).optional(),
  dueDate: dateKey,
  dueTime: nullableTime,
});

export const assignmentUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(4000).optional(),
    dueDate: dateKey.optional(),
    dueTime: nullableTime,
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field.' });

export const assignmentProgressSchema = z.object({
  completed: z.boolean(),
  baseRevision: z.number().int().min(0).optional(),
});
