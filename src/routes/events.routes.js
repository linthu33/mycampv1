import express from 'express';

import * as controller from '../controllers/events.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { eventCreateSchema, eventUpdateSchema } from '../validators/planner.schema.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.use(requireAuth);

// FR-CAL-002/003: personal academic events.
router.get('/', asyncHandler(controller.list));
router.post('/', validate(eventCreateSchema), asyncHandler(controller.create));
router.patch('/:id', validate(eventUpdateSchema), asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.remove));

export default router;
