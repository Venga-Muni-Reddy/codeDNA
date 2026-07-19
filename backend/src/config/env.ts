import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load env variables
const envPath = path.resolve(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath });

const envSchema = z.object({
  PORT: z.string().transform((val) => parseInt(val, 10)).default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS: z.string().optional().default('http://localhost:5173,http://localhost:3000'),
  MONGO_URI: z.string().default('mongodb://localhost:27017/codeatlas'),
  JWT_SECRET: z.string().default('supersecretjwtkeychangeinproduction'),
  JWT_REFRESH_SECRET: z.string().default('supersecretrefreshjwtkeychangeinproduction'),
  OPENROUTER_API_KEY: z.string().optional().or(z.literal('')),
  OPENROUTER_MODEL: z.string().default('openai/gpt-3.5-turbo'),
  GEMINI_API_KEY: z.string().optional().or(z.literal('')),
  REDIS_URL: z.string().optional().or(z.literal('')),
  UPLOAD_PATH: z.string().default('uploads'),
  MAX_UPLOAD_SIZE: z.string().transform((val) => parseInt(val, 10)).default('52428800'),
  GITHUB_CLIENT_ID: z.string().optional().or(z.literal('')),
  GITHUB_SECRET: z.string().optional().or(z.literal('')),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Environment configuration validation failed:');
  console.error(JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1);
}

export const env = parsedEnv.data;
