import express from 'express';

import * as controller from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = express.Router();

router.use(requireAuth);

// FR-NAV-003/004/005: role-specific home and day drilldown.
router.get('/', asyncHandler(controller.home));
router.get('/schedule', asyncHandler(controller.daySchedule));

export default router;
