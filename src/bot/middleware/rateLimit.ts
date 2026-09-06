import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../../types/context.js';

const userRequests = new Map<number, number[]>();
const WINDOW_MS = 3000; // 3 seconds window
const MAX_REQUESTS = 10; // Max 10 interactions per window

export const rateLimitMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (!ctx.from) return next();

  const userId = ctx.from.id;
  const now = Date.now();

  const timestamps = userRequests.get(userId) || [];
  const validTimestamps = timestamps.filter((t) => now - t < WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⚠️ Rate limit exceeded. Please wait a moment.', { show_alert: true });
    } else {
      await ctx.reply('⚠️ Rate limit exceeded. Please slow down.');
    }
    return;
  }

  validTimestamps.push(now);
  userRequests.set(userId, validTimestamps);

  return next();
};
