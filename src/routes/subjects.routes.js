import express from 'express';

import * as controller from '../controllers/subjects.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { subjectCreateSchema, subjectUpdateSchema } from '../validators/planner.schema.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.use(requireAuth);

// FR-SUB-001..005: personal subjects for both roles.
router.get('/', asyncHandler(controller.list));
router.post('/', validate(subjectCreateSchema), asyncHandler(controller.create));
router.get('/:id', asyncHandler(controller.getOne));
router.get('/:id/impact', asyncHandler(controller.impact));
router.patch('/:id', validate(subjectUpdateSchema), asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.remove));

export default router;
