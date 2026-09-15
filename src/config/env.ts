import * as dotenv from "dotenv";
import { resolve } from "path";
import { Logger } from "@nestjs/common";

// Load environment variables from the project root `.env` file.
dotenv.config({ path: resolve(process.cwd(), ".env") });

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && !Number.isNaN(parsed) ? parsed : fallback;
}

function csv(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: num(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwt: {
    secret: process.env.JWT_SECRET ?? "smv-holdings-dev-secret",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ?? "smv-holdings-dev-refresh-secret",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
  },
  sms: {
    apiKey: process.env.TEXT_LK_API_KEY ?? "",
    senderId: process.env.TEXT_LK_SENDER_ID ?? "",
    url: process.env.TEXT_LK_URL ?? "",
  },
  corsOrigins: csv(process.env.CORS_ORIGINS, ["http://localhost:5173"]),
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  storage: {
    bucketName: process.env.STORAGE_BUCKET_NAME ?? "",
    accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "",
    secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "",
    endpoint: process.env.STORAGE_ENDPOINT ?? "",
    region: process.env.STORAGE_REGION ?? "auto",
    presignDurationSeconds: num(process.env.STORAGE_PRESIGN_DURATION, 15 * 60),
  },
};

// ---------------------------------------------------------------------------
// Startup validation
// ---------------------------------------------------------------------------

const validationLogger = new Logger("EnvValidation");

export function validateEnvironment(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  const weak = (v?: string) =>
    !v ||
    v.length < 32 ||
    /change-me|super-secret|dev-secret|placeholder/i.test(v);

  // ---- JWT ----
  if (weak(config.jwt.secret)) {
    errors.push(
      "JWT_SECRET is weak or missing. Generate one: openssl rand -hex 32",
    );
  }
  if (weak(config.jwt.refreshSecret)) {
    errors.push(
      "JWT_REFRESH_SECRET is weak or missing. Generate one: openssl rand -hex 32",
    );
  }
  if (config.jwt.secret === config.jwt.refreshSecret) {
    errors.push("JWT_SECRET and JWT_REFRESH_SECRET must be different values.");
  }

  // ---- Database ----
  if (!/^postgres(ql)?:\/\//.test(config.databaseUrl)) {
    errors.push("DATABASE_URL must start with postgresql:// or postgres://");
  }
  if (
    config.nodeEnv === "production" &&
    !/sslmode=require/.test(config.databaseUrl)
  ) {
    warnings.push(
      "DATABASE_URL in production has no sslmode=require — most managed Postgres requires TLS.",
    );
  }

  // ---- Storage ----
  if (!/^https?:\/\//.test(config.storage.endpoint)) {
    errors.push(
      "STORAGE_ENDPOINT must be a valid http(s) URL (e.g. https://<account>.r2.cloudflarestorage.com).",
    );
  }
  if (
    !config.storage.bucketName ||
    config.storage.bucketName === "your-bucket-name"
  ) {
    errors.push("STORAGE_BUCKET_NAME is missing or still the placeholder.");
  }
  if (
    !config.storage.accessKeyId ||
    config.storage.accessKeyId === "your-access-key-id"
  ) {
    errors.push("STORAGE_ACCESS_KEY is missing or still the placeholder.");
  }
  if (
    !config.storage.secretAccessKey ||
    config.storage.secretAccessKey === "your-secret-access-key"
  ) {
    errors.push("STORAGE_SECRET_KEY is missing or still the placeholder.");
  }
  if (config.storage.presignDurationSeconds < 60) {
    errors.push(
      `STORAGE_PRESIGN_DURATION is ${config.storage.presignDurationSeconds}s — must be at least 60.`,
    );
  }

  // ---- SMS (informational) ----
  if (!config.sms.apiKey) {
    warnings.push(
      "TEXT_LK_API_KEY is empty — SMS sending will be simulated (SENT status only).",
    );
  }

  // ---- CORS ----
  if (config.corsOrigins.length === 0) {
    errors.push(
      "CORS_ORIGINS is empty — no client will be able to reach the API.",
    );
  }
  if (
    config.nodeEnv === "production" &&
    config.corsOrigins.some((o) => o.includes("localhost"))
  ) {
    warnings.push("CORS_ORIGINS contains localhost in production.");
  }

  // ---- Port ----
  if (config.port < 1 || config.port > 65535) {
    errors.push(`PORT ${config.port} is out of range (1–65535).`);
  }

  // ---- Report ----
  warnings.forEach((w) => validationLogger.warn(w));

  if (errors.length > 0) {
    validationLogger.error("Environment validation failed:");
    errors.forEach((e) => validationLogger.error(`  • ${e}`));
    throw new Error(
      `Invalid environment configuration (${errors.length} issue(s)).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Redacted config summary (safe to log — masks secrets)
// ---------------------------------------------------------------------------

export function logConfigSummary(): void {
  const mask = (v?: string) =>
    !v
      ? "(missing)"
      : v.length <= 8
        ? "***"
        : `${v.slice(0, 4)}…${v.slice(-4)}`;

  const redactDb = (u: string) => u.replace(/:\/\/[^@]+@/, "://***@");

  validationLogger.log("Config summary:");
  validationLogger.log(`  NODE_ENV           = ${config.nodeEnv}`);
  validationLogger.log(`  PORT               = ${config.port}`);
  validationLogger.log(
    `  DATABASE_URL       = ${redactDb(config.databaseUrl)}`,
  );
  validationLogger.log(`  JWT_SECRET         = ${mask(config.jwt.secret)}`);
  validationLogger.log(
    `  JWT_REFRESH_SECRET = ${mask(config.jwt.refreshSecret)}`,
  );
  validationLogger.log(
    `  SMS                = ${config.sms.apiKey ? "enabled" : "disabled (simulated)"}`,
  );
  validationLogger.log(
    `  CORS_ORIGINS       = ${config.corsOrigins.join(", ")}`,
  );
  validationLogger.log(
    `  STORAGE_BUCKET     = ${config.storage.bucketName || "(missing)"}`,
  );
  validationLogger.log(
    `  STORAGE_ENDPOINT   = ${config.storage.endpoint || "(missing)"}`,
  );
}
