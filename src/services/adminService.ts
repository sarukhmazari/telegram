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

  static async approvePayment(paymentId: string, adminNotes?: string, bot?: Telegraf<BotContext>): Promise<boolean> {
    const provider = new ManualPaymentProvider();
    const result = await provider.verifyPayment(paymentId, { approve: true, adminNotes });

    if (result.isVerified) {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { order: true },
      });

      if (payment) {
        // Trigger order delivery upon approval
        await DeliveryService.processOrderDelivery(payment.orderId, bot);
      }
      return true;
    }
    return false;
  }

  static async rejectPayment(paymentId: string, adminNotes?: string, bot?: Telegraf<BotContext>): Promise<boolean> {
    const provider = new ManualPaymentProvider();
    await provider.verifyPayment(paymentId, { approve: false, adminNotes });

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { user: true, order: true },
    });

    if (payment && bot) {
      const msg = `❌ *Payment Verification Failed*\n\nOrder #${payment.order.orderNumber}\nAmount: Rs. ${Number(payment.amount).toFixed(2)}\n\nReason: ${adminNotes || 'Verification rejected by store admin.'}`;
      await bot.telegram.sendMessage(payment.user.telegramId.toString(), msg, { parse_mode: 'Markdown' }).catch(() => {});
    }

    return true;
  }
}
