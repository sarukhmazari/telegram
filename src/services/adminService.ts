import { prisma } from '../database/index.js';
import { encryptData, decryptData } from '../utils/crypto.js';
import { PaymentStatus, OrderStatus, DeliveryStatus } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { DeliveryService } from './deliveryService.js';
import { Telegraf } from 'telegraf';
import { BotContext } from '../types/context.js';
import { ManualPaymentProvider } from '../payments/providers/manualPaymentProvider.js';

export interface DashboardMetrics {
  totalUsers: number;
  totalOrders: number;
  todaysOrders: number;
  totalRevenue: number;
  todaysRevenue: number;
  pendingPayments: number;
  pendingDeliveries: number;
  lowStockItemsCount: number;
}

export interface BulkImportResult {
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
}

export interface PaymentActionResult {
  success: boolean;
  error?: string;
  orderNumber?: string;
  amount?: string;
  customer?: string;
}

export class AdminService {
  static async getDashboardMetrics(): Promise<DashboardMetrics> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalOrders,
      todaysOrders,
      paidOrders,
      todaysPaidOrders,
      pendingPayments,
      pendingDeliveries,
      lowStockVariants,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.order.findMany({
        where: { paymentStatus: PaymentStatus.PAID },
        select: { totalAmount: true },
      }),
      prisma.order.findMany({
        where: { paymentStatus: PaymentStatus.PAID, createdAt: { gte: startOfToday } },
        select: { totalAmount: true },
      }),
      prisma.payment.count({ where: { status: PaymentStatus.WAITING_FOR_VERIFICATION } }),
      prisma.order.count({ where: { deliveryStatus: DeliveryStatus.PENDING, paymentStatus: PaymentStatus.PAID } }),
      prisma.stockItem.groupBy({
        by: ['variantId'],
        where: { isSold: false, lockedAt: null },
        _count: { id: true },
        having: { id: { _count: { lt: 5 } } },
      }),
    ]);

    const totalRevenue = paidOrders.reduce((acc, curr) => acc + Number(curr.totalAmount), 0);
    const todaysRevenue = todaysPaidOrders.reduce((acc, curr) => acc + Number(curr.totalAmount), 0);

    return {
      totalUsers,
      totalOrders,
      todaysOrders,
      totalRevenue,
      todaysRevenue,
      pendingPayments,
      pendingDeliveries,
      lowStockItemsCount: lowStockVariants.length,
    };
  }

  static async importBulkStock(
    variantId: string,
    rawTextLines: string[],
    fileId?: string
  ): Promise<BulkImportResult> {
    let importedCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;

    const existingItems = await prisma.stockItem.findMany({
      where: { variantId },
      select: { content: true },
    });
    const existingPlaintexts = new Set(existingItems.map((item) => decryptData(item.content)));

    for (const rawLine of rawTextLines) {
      const trimmed = rawLine.trim();
      if (!trimmed && !fileId) {
        invalidCount++;
        continue;
      }

      if (existingPlaintexts.has(trimmed)) {
        duplicateCount++;
        continue;
      }

      const encryptedContent = encryptData(trimmed);

      await prisma.stockItem.create({
        data: {
          variantId,
          content: encryptedContent,
          fileId: fileId || null,
        },
      });

      existingPlaintexts.add(trimmed);
      importedCount++;
    }

    logger.info('Bulk stock imported', { variantId, importedCount, duplicateCount, invalidCount });

    return { importedCount, duplicateCount, invalidCount };
  }

  static async approvePayment(
    paymentId: string,
    adminNotes?: string,
    botInstance?: any
  ): Promise<PaymentActionResult> {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          order: {
            include: {
              items: {
                include: { variant: { include: { product: true } } },
              },
            },
          },
          user: true,
        },
      });

      if (!payment) {
        return { success: false, error: 'Payment record not found.' };
      }

      const customerDisplay = payment.user.username
        ? `@${payment.user.username}`
        : (payment.user.firstName || payment.user.id);
      const amountStr = Number(payment.amount).toFixed(2);
      const orderNum = payment.order.orderNumber;

      if (payment.status === PaymentStatus.PAID && payment.order.deliveryStatus === DeliveryStatus.DELIVERED) {
        return {
          success: true,
          orderNumber: orderNum,
          amount: amountStr,
          customer: customerDisplay,
        };
      }

      const provider = new ManualPaymentProvider();
      const result = await provider.verifyPayment(paymentId, { approve: true, adminNotes });

      if (!result.isVerified) {
        return { success: false, error: 'Verification failed in payment provider.' };
      }

      try {
        await DeliveryService.processOrderDelivery(payment.orderId, botInstance);
      } catch (delivErr: any) {
        logger.error('Automatic delivery failed during payment approval', {
          paymentId,
          error: delivErr.message,
        });
        return {
          success: false,
          error: delivErr.message || 'Delivery failed. Please ensure stock is available.',
          orderNumber: orderNum,
          amount: amountStr,
          customer: customerDisplay,
        };
      }

      return {
        success: true,
        orderNumber: orderNum,
        amount: amountStr,
        customer: customerDisplay,
      };
    } catch (err: any) {
      logger.error('Error during approvePayment', { paymentId, error: err.message });
      return { success: false, error: err.message || 'Approval execution failed.' };
    }
  }

  static async rejectPayment(
    paymentId: string,
    adminNotes?: string,
    botInstance?: any
  ): Promise<PaymentActionResult> {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { user: true, order: true },
      });

      if (!payment) {
        return { success: false, error: 'Payment record not found.' };
      }

      const customerDisplay = payment.user.username
        ? `@${payment.user.username}`
        : (payment.user.firstName || payment.user.id);
      const amountStr = Number(payment.amount).toFixed(2);
      const orderNum = payment.order.orderNumber;

      const provider = new ManualPaymentProvider();
      await provider.verifyPayment(paymentId, { approve: false, adminNotes });

      if (botInstance) {
        const telegramApi = botInstance.telegram || (typeof botInstance.sendMessage === 'function' ? botInstance : null);
        if (telegramApi) {
          const msg =
            `❌ *Payment Verification Update*\n\n` +
            `• *Order Number:* \`#${orderNum}\`\n` +
            `• *Amount:* Rs. ${amountStr} ${payment.currency}\n` +
            `• *Status:* ❌ *Payment Rejected / Declined*\n` +
            `• *Reason:* ${adminNotes || 'Verification rejected by store admin.'}\n\n` +
            `If you believe this is a mistake, please contact support (@zoxer19).`;

          await telegramApi.sendMessage(payment.user.telegramId.toString(), msg, {
            parse_mode: 'Markdown',
          }).catch(() => {});
        }
      }

      return {
        success: true,
        orderNumber: orderNum,
        amount: amountStr,
        customer: customerDisplay,
      };
    } catch (err: any) {
      logger.error('Error during rejectPayment', { paymentId, error: err.message });
      return { success: false, error: err.message || 'Rejection execution failed.' };
    }
  }
}
