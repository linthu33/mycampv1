import express from 'express';

import * as controller from '../controllers/reminders.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.use(requireAuth);

// FR-REM-002/004: Due Soon, Overdue and Upcoming reminder buckets.
router.get('/', asyncHandler(controller.list));

export default router;
