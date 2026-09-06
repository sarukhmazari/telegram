import { bot } from './bot/index.js';
import { prisma } from './database/index.js';
import { logger } from './utils/logger.js';

async function diagnose() {
  console.log('--- DIAGNOSTIC RUN ---');
  try {
    const userCount = await prisma.user.count();
    console.log(`Database connected successfully! Total users in DB: ${userCount}`);
  } catch (err: any) {
    console.error('Database connection test failed:', err.message);
  }

  bot.use(async (ctx, next) => {
    console.log(`RECEIVED UPDATE! Type: ${ctx.updateType}, From: ${ctx.from?.id} (${ctx.from?.username})`);
    return next();
  });
}

diagnose().catch(console.error);
