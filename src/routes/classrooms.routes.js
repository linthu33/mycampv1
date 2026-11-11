import express from 'express';

import * as controller from '../controllers/classrooms.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import {
  classroomCreateSchema,
  classroomUpdateSchema,
  joinClassroomSchema,
} from '../validators/planner.schema.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.use(requireAuth);

// Shared reads (role-aware payloads).
router.get('/', asyncHandler(controller.list));
router.post('/join', requireRole('student'), validate(joinClassroomSchema), asyncHandler(controller.join));

router.post('/', requireRole('teacher'), validate(classroomCreateSchema), asyncHandler(controller.create));

router.get('/:id', asyncHandler(controller.getOne));
router.get('/:id/events', asyncHandler(controller.events));
router.post('/:id/leave', requireRole('student'), asyncHandler(controller.leave));

// Teacher-only administration — FR-CLASS-006.
router.patch(
  '/:id',
  requireRole('teacher'),
  validate(classroomUpdateSchema),
  asyncHandler(controller.update),
);
router.post('/:id/archive', requireRole('teacher'), asyncHandler(controller.archive));
router.post('/:id/reset-code', requireRole('teacher'), asyncHandler(controller.resetCode));
router.get('/:id/members', requireRole('teacher'), asyncHandler(controller.members));
router.delete('/:id/members/:memberId', requireRole('teacher'), asyncHandler(controller.removeMember));
router.post(
  '/:id/members/:memberId/unblock',
  requireRole('teacher'),
  asyncHandler(controller.unblockMember),
);

export default router;
