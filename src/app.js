import express from 'express';
import cors from 'cors';

import env from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import subjectRoutes from './routes/subjects.routes.js';
import taskRoutes from './routes/tasks.routes.js';
import eventRoutes from './routes/events.routes.js';
import timetableRoutes from './routes/timetable.routes.js';
import classroomRoutes from './routes/classrooms.routes.js';
import assignmentRoutes from './routes/assignments.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import reminderRoutes from './routes/reminders.routes.js';
import { notFound, errorHandler } from './middlewares/error.middleware.js';

const app = express();

app.disable('x-powered-by');
app.use(
  cors({
    origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((origin) => origin.trim()),
  }),
);
app.use(express.json({ limit: '100kb' }));

const healthHandler = (_req, res) => {
  res.json({ status: 'ok', service: 'mycampus-api', time: new Date().toISOString() });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reminders', reminderRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
