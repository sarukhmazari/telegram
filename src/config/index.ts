import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  BOT_TOKEN: z.string().trim().min(1, 'BOT_TOKEN is required'),
  ADMIN_IDS: z.string().transform((val) =>
    val.split(',').map((id) => id.trim()).filter((id) => id.length > 0)
  ),
  DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),
  ENCRYPTION_KEY: z.string().trim().min(16, 'ENCRYPTION_KEY must be at least 16 chars'),
  STORE_NAME: z
    .string()
    .trim()
    .default('Digital Store')
    .transform((val) => (/^[a-f0-9]{32,64}$/i.test(val) ? 'Digital Store' : val)),
  STORE_CURRENCY: z.string().trim().default('USD'),
  SUPPORT_USERNAME: z.string().trim().default('zoxer19'),
  ENABLE_WALLET: z
    .string()
    .trim()
    .transform((val) => val === 'true')
    .default('true'),
  ENABLE_REFERRALS: z
    .string()
    .trim()
    .transform((val) => val === 'true')
    .default('true'),
  ENABLE_REVIEWS: z
    .string()
    .trim()
    .transform((val) => val === 'true')
    .default('true'),
  ENABLE_COUPONS: z
    .string()
    .trim()
    .transform((val) => val === 'true')
    .default('true'),
  BOT_MODE: z
    .string()
    .trim()
    .default('webhook')
    .transform((val) => (val.toLowerCase() === 'polling' ? 'polling' : 'webhook')),
  WEBHOOK_URL: z.string().trim().optional(),
  PORT: z
    .string()
    .trim()
    .transform((val) => parseInt(val, 10))
    .default('3000'),
  LOG_LEVEL: z.string().trim().default('info'),
});

export let configError: any = null;
let validatedConfig: any;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  configError = parsedEnv.error.format();
  console.error('❌ Environment validation issues:', configError);
  // Safe fallback to prevent serverless import crashes
  const rawStoreName = process.env.STORE_NAME || 'Digital Store';
  validatedConfig = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    ADMIN_IDS: (process.env.ADMIN_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
    DATABASE_URL: process.env.DATABASE_URL || '',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'default_fallback_encryption_key_32c',
    STORE_NAME: /^[a-f0-9]{32,64}$/i.test(rawStoreName) ? 'Digital Store' : rawStoreName,
    STORE_CURRENCY: process.env.STORE_CURRENCY || 'USD',
    SUPPORT_USERNAME: process.env.SUPPORT_USERNAME || 'zoxer19',
    ENABLE_WALLET: process.env.ENABLE_WALLET !== 'false',
    ENABLE_REFERRALS: process.env.ENABLE_REFERRALS !== 'false',
    ENABLE_REVIEWS: process.env.ENABLE_REVIEWS !== 'false',
    ENABLE_COUPONS: process.env.ENABLE_COUPONS !== 'false',
    BOT_MODE: (process.env.BOT_MODE as any) || 'polling',
    WEBHOOK_URL: process.env.WEBHOOK_URL,
    PORT: parseInt(process.env.PORT || '3000', 10),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  };
} else {
  validatedConfig = parsedEnv.data;
}

export const config = validatedConfig;

