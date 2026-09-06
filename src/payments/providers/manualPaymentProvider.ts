import { IPaymentProvider, CreatePaymentResult, VerifyPaymentResult } from '../interfaces/paymentProvider.js';
import { prisma } from '../../database/index.js';
import { PaymentStatus } from '@prisma/client';
import { logger } from '../../utils/logger.js';

export class ManualPaymentProvider implements IPaymentProvider {
  readonly providerName = 'MANUAL';

  async createPayment(
    orderId: string,
    userId: string,
    amount: number,
    currency: string,
    idempotencyKey: string,
    metadata?: Record<string, any>
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
        status: PaymentStatus.WAITING_FOR_VERIFICATION,
        proofFileId: metadata?.proofFileId || null,
        transactionReference: metadata?.transactionReference || null,
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: PaymentStatus.WAITING_FOR_VERIFICATION, paymentMethod: this.providerName },
    });

    logger.info('Manual payment submission created', { paymentId: payment.id, orderId, userId });

    return {
      paymentId: payment.id,
      status: PaymentStatus.WAITING_FOR_VERIFICATION,
      instructions: 'Please send transfer proof/transaction reference number for admin verification.',
    };
  }

  async verifyPayment(paymentId: string, verificationData?: Record<string, any>): Promise<VerifyPaymentResult> {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error('Payment not found');

    const approve = verificationData?.approve === true;
    const adminNotes = verificationData?.adminNotes || null;

    const newStatus = approve ? PaymentStatus.PAID : PaymentStatus.REJECTED;

    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: newStatus,
        adminNotes,
      },
    });

    await prisma.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: newStatus },
    });

    logger.info('Manual payment verification completed', { paymentId, approved: approve });

    return {
      isVerified: approve,
      status: newStatus,
      transactionReference: updatedPayment.transactionReference || undefined,
      adminNotes: adminNotes || undefined,
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
