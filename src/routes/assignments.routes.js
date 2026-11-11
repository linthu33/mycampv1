import express from 'express';

import * as controller from '../controllers/assignments.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import {
  assignmentCreateSchema,
  assignmentUpdateSchema,
  assignmentProgressSchema,
} from '../validators/planner.schema.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.use(requireAuth);

// Reads are role-aware: teachers never receive progress (FR-ASG-005).
router.get('/', asyncHandler(controller.list));
router.get('/:id', asyncHandler(controller.getOne));

// Teacher authoring — FR-ASG-001/002.
router.post(
  '/',
  requireRole('teacher'),
  validate(assignmentCreateSchema),
  asyncHandler(controller.create),
);
router.patch(
  '/:id',
  requireRole('teacher'),
  validate(assignmentUpdateSchema),
  asyncHandler(controller.update),
);
router.post('/:id/publish', requireRole('teacher'), asyncHandler(controller.publish));
router.post('/:id/archive', requireRole('teacher'), asyncHandler(controller.archive));
router.delete('/:id', requireRole('teacher'), asyncHandler(controller.remove));

// Student completion — FR-ASG-004/007.
router.patch(
  '/:id/progress',
  requireRole('student'),
  validate(assignmentProgressSchema),
  asyncHandler(controller.setProgress),
);

export default router;
