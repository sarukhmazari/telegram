import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
const envSchema = z.object({
    BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
    ADMIN_IDS: z.string().transform((val) => val.split(',').map((id) => id.trim()).filter((id) => id.length > 0)),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    ENCRYPTION_KEY: z.string().min(16, 'ENCRYPTION_KEY must be at least 16 chars'),
    STORE_NAME: z.string().default('Digital Store'),
    STORE_CURRENCY: z.string().default('USD'),
    SUPPORT_USERNAME: z.string().default('zoxer19'),
    ENABLE_WALLET: z
        .string()
        .transform((val) => val === 'true')
        .default('true'),
    ENABLE_REFERRALS: z
        .string()
        .transform((val) => val === 'true')
        .default('true'),
    ENABLE_REVIEWS: z
        .string()
        .transform((val) => val === 'true')
        .default('true'),
    ENABLE_COUPONS: z
        .string()
        .transform((val) => val === 'true')
        .default('true'),
    BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
    WEBHOOK_URL: z.string().optional(),
    PORT: z
        .string()
        .transform((val) => parseInt(val, 10))
        .default('3000'),
    LOG_LEVEL: z.string().default('info'),
});
const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
    console.error('❌ Environment validation failed:', parsedEnv.error.format());
    throw new Error('Invalid environment configuration');
}
export const config = parsedEnv.data;
