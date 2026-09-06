import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../../types/context.js';
import { UserService } from '../../services/userService.js';
import { config } from '../../config/index.js';
import { Role } from '@prisma/client';

export const authMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (!ctx.from) {
    return next();
  }

  // Check start payload for referral code
  let referralCode: string | undefined = undefined;
  if (ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/start')) {
    const parts = ctx.message.text.split(' ');
    if (parts.length > 1 && parts[1].trim()) {
      referralCode = parts[1].trim();
    }
  }

  try {
    const dbUser = await UserService.findOrCreateUser(
      ctx.from.id,
      ctx.from.username,
      ctx.from.first_name,
      ctx.from.last_name,
      referralCode
    );

    if (dbUser.isBanned) {
      await ctx.reply('⛔ Your account has been suspended. Please contact support.');
      return;
    }

    ctx.dbUser = dbUser;
    ctx.isAdmin = dbUser.role === Role.ADMIN || config.ADMIN_IDS.includes(ctx.from.id.toString());

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    await ctx.reply('⚠️ Service temporarily unavailable. Please try again later.');
  }
};

export const adminGuard: MiddlewareFn<BotContext> = async (ctx, next) => {
  // If user is an authorized admin, allow request to proceed
  if (ctx.isAdmin) {
    return next();
  }

  // If user is NOT an admin, clear any stale admin session state so it doesn't block normal user flows
  if (ctx.session) {
    if (ctx.session.adminState || ctx.session.pendingStockLines) {
      delete ctx.session.adminState;
      delete ctx.session.pendingStockLines;
      delete ctx.session.adminData;
    }
  }

  // Check if update is an explicit admin action (callback starting with admin_)
  const isCbDataAdmin = Boolean(
    ctx.callbackQuery &&
      'data' in ctx.callbackQuery &&
      typeof (ctx.callbackQuery as any).data === 'string' &&
      (ctx.callbackQuery as any).data.startsWith('admin_')
  );

  if (isCbDataAdmin) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('⛔ Unauthorized: Admin access required.', { show_alert: true }).catch(() => {});
    } else {
      await ctx.reply('⛔ Unauthorized: Admin access required.');
    }
    return;
  }

  return next();
};

