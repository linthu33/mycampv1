import express from 'express';

import * as controller from '../controllers/timetable.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { timetableCreateSchema, timetableUpdateSchema } from '../validators/planner.schema.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.use(requireAuth);

// FR-CAL-005..007: recurring Monday–Friday timetable.
router.get('/', asyncHandler(controller.list));
router.post('/', validate(timetableCreateSchema), asyncHandler(controller.create));
router.patch('/:id', validate(timetableUpdateSchema), asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.remove));

export default router;
