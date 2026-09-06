import { prisma } from '../database/index.js';
import { OrderStatus, DeliveryStatus, DeliveryType } from '@prisma/client';
import { decryptData, encryptData } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { Telegraf } from 'telegraf';
import { BotContext } from '../types/context.js';
import { getBackHomeKeyboard } from '../bot/keyboards/main.js';

export class DeliveryService {
  /**
   * Process order delivery once payment is verified/PAID.
   */
  static async processOrderDelivery(orderId: string, bot?: Telegraf<BotContext>): Promise<boolean> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: {
          include: {
            variant: {
              include: { product: true },
            },
          },
        },
      },
    });

    if (!order || order.paymentStatus !== 'PAID') {
      logger.warn('Cannot process delivery for unpaid or invalid order', { orderId });
      return false;
    }

    if (order.deliveryStatus === DeliveryStatus.DELIVERED) {
      logger.info('Order already delivered', { orderId });
      return true;
    }

    const orderItem = order.items[0];
    if (!orderItem) {
      throw new Error('Order has no items to deliver');
    }

    const variant = orderItem.variant;

    // Check if stock items exist in database for this variant, or if deliveryType is automatic
    const stockCount = await prisma.stockItem.count({
      where: { variantId: variant.id, isSold: false, lockedAt: null },
    });

    if (
      stockCount >= orderItem.quantity ||
      variant.deliveryType === DeliveryType.AUTOMATIC ||
      variant.deliveryType === DeliveryType.KEY_CODE ||
      variant.deliveryType === DeliveryType.ACCOUNT_CREDENTIALS ||
      variant.deliveryType === DeliveryType.FILE
    ) {
      return this.processAutomaticDelivery(order, orderItem, bot);
    } else {
      return this.processManualDelivery(order, bot);
    }
  }

  private static async processAutomaticDelivery(
    order: any,
    orderItem: any,
    bot?: Telegraf<BotContext>
  ): Promise<boolean> {
    const quantity = orderItem.quantity;
    const variantId = orderItem.variantId;

    const deliveredItems = await prisma.$transaction(async (tx) => {
      // Find available stock items
      const stockItems = await tx.stockItem.findMany({
        where: {
          variantId,
          isSold: false,
          lockedAt: null,
        },
        take: quantity,
      });

      if (stockItems.length < quantity) {
        throw new Error(`Out of stock! Needed ${quantity}, found ${stockItems.length}`);
      }

      const stockIds = stockItems.map((s) => s.id);

      // Lock and mark stock items as sold
      await tx.stockItem.updateMany({
        where: { id: { in: stockIds } },
        data: {
          isSold: true,
          soldAt: new Date(),
          orderId: order.id,
        },
      });

      const decryptedPayloads = stockItems.map((item) => ({
        content: decryptData(item.content),
        fileId: item.fileId,
      }));

      const deliveryJson = JSON.stringify(decryptedPayloads);

      await tx.order.update({
        where: { id: order.id },
        data: {
          deliveryStatus: DeliveryStatus.DELIVERED,
          orderStatus: OrderStatus.COMPLETED,
          deliveryData: encryptData(deliveryJson),
          deliveredFileId: stockItems[0]?.fileId || null,
        },
      });

      // Completely remove delivered credentials from database StockItem table
      await tx.stockItem.deleteMany({
        where: { id: { in: stockIds } },
      });

      return decryptedPayloads;
    });

    logger.info('Automatic stock allocated and order delivered', {
      orderId: order.id,
      count: deliveredItems.length,
    });

    // Notify customer via Telegram
    if (bot) {
      await this.notifyCustomerDelivery(bot, order.user.telegramId, order.orderNumber, orderItem.variant.product.name, deliveredItems);
    }

    return true;
  }

  private static async processManualDelivery(order: any, bot?: any): Promise<boolean> {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        deliveryStatus: DeliveryStatus.PENDING,
        orderStatus: OrderStatus.PROCESSING,
      },
    });

    logger.info('Manual delivery required for order', { orderId: order.id });

    if (bot) {
      const telegramApi = bot.telegram || (typeof bot.sendMessage === 'function' ? bot : null);
      if (telegramApi) {
        const msg = `📦 *Processing Order* #${order.orderNumber}\n\nYour order has been paid! Our team is preparing your custom service/credentials and will deliver it shortly.`;
        await telegramApi.sendMessage(order.user.telegramId.toString(), msg, {
          parse_mode: 'Markdown',
          reply_markup: getBackHomeKeyboard().reply_markup,
        }).catch(() => {});
      }
    }

    return true;
  }

  static async notifyCustomerDelivery(
    bot: any,
    telegramId: bigint | number,
    orderNumber: string,
    productName: string,
    items: { content: string; fileId?: string | null }[]
  ) {
    const telegramApi = bot.telegram || (typeof bot.sendMessage === 'function' ? bot : null);
    if (!telegramApi) {
      logger.error('No valid Telegram API instance provided for delivery notification');
      return;
    }

    let message = `✅ *Purchase Complete! Order #${orderNumber}*\n\n`;
    message += `Product: *${productName}*\n\n`;
    message += `🔑 *Your Digital Product Credentials / Keys:*\n\n`;

    items.forEach((item) => {
      message += `\`\`\`\n${item.content}\n\`\`\`\n`;
    });

    message += `Thank you for shopping with us!`;

    await telegramApi.sendMessage(telegramId.toString(), message, {
      parse_mode: 'Markdown',
      reply_markup: getBackHomeKeyboard().reply_markup,
    });

    // Send file attachments if present
    for (const item of items) {
      if (item.fileId) {
        await telegramApi.sendDocument(telegramId.toString(), item.fileId).catch(() => {});
      }
    }
  }
}
