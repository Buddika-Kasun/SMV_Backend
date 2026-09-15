import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from the project root `.env` file.
dotenv.config({ path: resolve(process.cwd(), '.env') });

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && !Number.isNaN(parsed) ? parsed : fallback;
}

function csv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 3000),
  databaseUrl:
    process.env.DATABASE_URL ??
    '',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'smv-holdings-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    // Refresh tokens are signed with their own secret so they can never be
    // accepted by JwtAuthGuard as access tokens.
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'smv-holdings-dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },
  sms: {
    apiKey: process.env.TEXT_LK_API_KEY ?? '',
    senderId: process.env.TEXT_LK_SENDER_ID ?? '',
    url: process.env.TEXT_LK_URL ?? '',
  },
  corsOrigins: csv(process.env.CORS_ORIGINS, ['http://localhost:5173']),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  storage: {
    bucketName: process.env.STORAGE_BUCKET_NAME ?? '',
    accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '',
    secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
    endpoint: process.env.STORAGE_ENDPOINT ?? '',
    region: process.env.STORAGE_REGION ?? 'auto',
    presignDurationSeconds: num(process.env.STORAGE_PRESIGN_DURATION, 15 * 60),
  },
};