import express from 'express';

import * as controller from '../controllers/tasks.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { taskCreateSchema, taskUpdateSchema } from '../validators/planner.schema.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.use(requireAuth);

// FR-TASK-001..008: owner-only personal tasks.
router.get('/', asyncHandler(controller.list));
router.post('/', validate(taskCreateSchema), asyncHandler(controller.create));
router.patch('/:id', validate(taskUpdateSchema), asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.remove));

export default router;
