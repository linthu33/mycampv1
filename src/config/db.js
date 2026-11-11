import mongoose from 'mongoose';
import env from './env.js';

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 8000,
  });
  // eslint-disable-next-line no-console
  console.log(`[db] connected to ${env.mongoUri}`);
}
