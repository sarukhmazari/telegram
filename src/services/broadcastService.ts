import { prisma } from '../database/index.js';
import { BroadcastStatus } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { BotContext } from '../types/context.js';
import { logger } from '../utils/logger.js';

export class BroadcastService {
  static async sendBroadcast(
    adminId: string,
    messageText: string,
    bot: Telegraf<BotContext> | { telegram: any },
    fileId?: string
  ) {
    const users = await prisma.user.findMany({
      where: { isBanned: false },
      select: { telegramId: true },
    });

    const broadcast = await prisma.broadcast.create({
      data: {
        adminId,
        messageText: messageText || '(Photo announcement)',
        fileId: fileId || null,
        targetCount: users.length,
        status: BroadcastStatus.PROCESSING,
      },
    });

    let successCount = 0;
    let failCount = 0;

    // Send in batches of 10 concurrent requests with small delays to respect Telegram limits (30 msgs/sec)
    const BATCH_SIZE = 10;
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (user) => {
          const targetId = user.telegramId.toString();
          let sent = false;

          try {
            if (fileId) {
              try {
                await bot.telegram.sendPhoto(targetId, fileId, {
                  caption: messageText || undefined,
                  parse_mode: 'Markdown',
                });
                sent = true;
              } catch (mdErr) {
                // Fallback without Markdown
                await bot.telegram.sendPhoto(targetId, fileId, {
                  caption: messageText ? messageText.replace(/[*_`\[\]]/g, '') : undefined,
                });
                sent = true;
              }
            } else if (messageText) {
              try {
                await bot.telegram.sendMessage(targetId, messageText, { parse_mode: 'Markdown' });
                sent = true;
              } catch (mdErr) {
                // Fallback without Markdown
                await bot.telegram.sendMessage(targetId, messageText.replace(/[*_`\[\]]/g, ''));
                sent = true;
              }
            }

            if (sent) {
              successCount++;
            } else {
              failCount++;
            }
          } catch (err) {
            failCount++;
          }
        })
      );

      if (i + BATCH_SIZE < users.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    const updated = await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: {
        successCount,
        failCount,
        status: BroadcastStatus.COMPLETED,
      },
    });

    logger.info('Broadcast execution completed', {
      broadcastId: updated.id,
      successCount,
      failCount,
      targetCount: users.length,
    });

    return updated;
  }
}
