import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  PORT: z.string().transform(Number).default("4000"),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  REFRESH_TOKEN_SECRET: z.string().min(16),
  OPENAI_API_KEY: z.string().min(1),
  DOMAIN: z.string().default("localhost"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  AUDIO_TEMP_DIR: z.string().default("/tmp/medivoz-audio"),
  AUDIO_TEMP_UPLOAD_TTL_MINUTES: z.string().transform(Number).default("30"),
  AUDIO_TEMP_ERROR_TTL_MINUTES: z.string().transform(Number).default("120"),
  AUDIO_TEMP_CLEANUP_INTERVAL_MS: z.string().transform(Number).default("300000"),
  AUDIO_TEMP_DELETE_MAX_RETRIES: z.string().transform(Number).default("3"),
  EXTRACTION_VERSION_DRIFT_MAX: z.string().transform(Number).default("60"),
});

export const env = envSchema.parse(process.env);
