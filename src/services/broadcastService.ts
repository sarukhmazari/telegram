import { prisma } from '../database/index.js';
import { BroadcastStatus } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { BotContext } from '../types/context.js';
import { logger } from '../utils/logger.js';

export class BroadcastService {
  static async sendBroadcast(
    adminId: string,
    messageText: string,
    bot: Telegraf<BotContext>,
    fileId?: string
  ) {
    const users = await prisma.user.findMany({
      where: { isBanned: false },
      select: { telegramId: true },
    });

    const broadcast = await prisma.broadcast.create({
      data: {
        adminId,
        messageText,
        fileId: fileId || null,
        targetCount: users.length,
        status: BroadcastStatus.PROCESSING,
      },
    });

    let successCount = 0;
    let failCount = 0;

    // Async batch execution to prevent blocking
    (async () => {
      for (const user of users) {
        try {
          if (fileId) {
            await bot.telegram.sendPhoto(user.telegramId.toString(), fileId, { caption: messageText, parse_mode: 'Markdown' });
          } else {
            await bot.telegram.sendMessage(user.telegramId.toString(), messageText, { parse_mode: 'Markdown' });
          }
          successCount++;
        } catch (error) {
          failCount++;
        }

        // Small delay to respect Telegram API rate limits (30 msgs/sec)
        await new Promise((resolve) => setTimeout(resolve, 40));
      }

      await prisma.broadcast.update({
        where: { id: broadcast.id },
        data: {
          successCount,
          failCount,
          status: BroadcastStatus.COMPLETED,
        },
      });

      logger.info('Broadcast execution completed', { broadcastId: broadcast.id, successCount, failCount });
    })();

    return broadcast;
  }
}
