import mongoose from 'mongoose';

import env from './config/env.js';
import { connectDatabase } from './config/db.js';
import app from './app.js';

async function start() {
  try {
    await connectDatabase();
    const server = app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`[api] MyCampus API listening on http://localhost:${env.port}`);
      // eslint-disable-next-line no-console
      console.log(`[api] environment=${env.nodeEnv}`);
    });

    const shutdown = async (signal) => {
      // eslint-disable-next-line no-console
      console.log(`\n[api] ${signal} received, shutting down…`);
      server.close(async () => {
        await mongoose.connection.close();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api] failed to start:', err.message);
    process.exit(1);
  }
}

start();
