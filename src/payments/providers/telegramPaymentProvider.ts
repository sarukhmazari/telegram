import { IPaymentProvider, CreatePaymentResult, VerifyPaymentResult } from '../interfaces/paymentProvider.js';
import { prisma } from '../../database/index.js';
import { PaymentStatus } from '@prisma/client';
import { logger } from '../../utils/logger.js';

export class TelegramPaymentProvider implements IPaymentProvider {
  readonly providerName = 'TELEGRAM_PAYMENTS';

  async createPayment(
    orderId: string,
    userId: string,
    amount: number,
    currency: string,
    idempotencyKey: string
  ): Promise<CreatePaymentResult> {
    const existingPayment = await prisma.payment.findUnique({
      where: { idempotencyKey },
    });

    if (existingPayment) {
      return {
        paymentId: existingPayment.id,
        status: existingPayment.status,
      };
    }

    const payment = await prisma.payment.create({
      data: {
        idempotencyKey,
        orderId,
        userId,
        amount,
        currency,
        provider: this.providerName,
        status: PaymentStatus.PENDING,
      },
    });

    return {
      paymentId: payment.id,
      status: PaymentStatus.PENDING,
      instructions: 'Click button to complete native Telegram payment invoice.',
    };
  }

  async verifyPayment(paymentId: string, verificationData?: Record<string, any>): Promise<VerifyPaymentResult> {
    const telegramChargeId = verificationData?.telegramPaymentChargeId;

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PAID,
        transactionReference: telegramChargeId || `TG_PAY_${Date.now()}`,
      },
    });

    await prisma.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: PaymentStatus.PAID, paymentMethod: this.providerName },
    });

    logger.info('Telegram payment verified', { paymentId, telegramChargeId });

    return {
      isVerified: true,
      status: PaymentStatus.PAID,
      transactionReference: payment.transactionReference || undefined,
    };
  }

  async refundPayment(paymentId: string): Promise<boolean> {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.REFUNDED },
    });
    return true;
  }
}
