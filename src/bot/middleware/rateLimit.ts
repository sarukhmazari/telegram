import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../../types/context.js';
import { config } from '../../config/index.js';

const userRequests = new Map<number, number[]>();
const WINDOW_MS = 2000; // 2 seconds window
const MAX_REQUESTS = 12; // Max 12 interactions per window

let lastCleanup = Date.now();

export const rateLimitMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (!ctx.from) return next();

  const userId = ctx.from.id;
  const userIdStr = userId.toString();

  // Root admins and staff are never rate limited
  if (config.ADMIN_IDS.includes(userIdStr)) {
    return next();
  }

  const now = Date.now();

  // Prune map every 60 seconds
  if (now - lastCleanup > 60000) {
    lastCleanup = now;
    for (const [id, times] of userRequests.entries()) {
      const active = times.filter((t) => now - t < WINDOW_MS);
      if (active.length === 0) {
        userRequests.delete(id);
      } else {
        userRequests.set(id, active);
      }
    }
  }

  const timestamps = userRequests.get(userId) || [];
  const validTimestamps = timestamps.filter((t) => now - t < WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⚠️ Please wait a moment...', { show_alert: false }).catch(() => {});
    }
    return;
  }

  validTimestamps.push(now);
  userRequests.set(userId, validTimestamps);

  return next();
};

