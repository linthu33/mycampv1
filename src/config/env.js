import 'dotenv/config';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number.parseInt(process.env.PORT || '4000', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mycampus',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  exposeDevCodes: String(process.env.EXPOSE_DEV_CODES || 'true') === 'true',
  defaultAcademicTimezone: process.env.DEFAULT_ACADEMIC_TIMEZONE || 'Asia/Yangon',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
};

if (env.isProduction && env.jwtSecret === 'dev-only-insecure-secret-change-me') {
  throw new Error('JWT_SECRET must be set to a strong value in production.');
}
if (env.isProduction && env.exposeDevCodes) {
  // Fail fast: never leak verification codes in production responses.
  env.exposeDevCodes = false;
}

export default env;
