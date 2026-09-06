import { IPaymentProvider, CreatePaymentResult, VerifyPaymentResult } from '../interfaces/paymentProvider.js';
import { prisma } from '../../database/index.js';
import { PaymentStatus, TransactionType } from '@prisma/client';
import { UserService } from '../../services/userService.js';
import { logger } from '../../utils/logger.js';

export class WalletPaymentProvider implements IPaymentProvider {
  readonly providerName = 'WALLET';

  async createPayment(
    orderId: string,
    userId: string,
    amount: number,
    currency: string,
    idempotencyKey: string
  ): Promise<CreatePaymentResult> {
    // Idempotency check
    const existingPayment = await prisma.payment.findUnique({
      where: { idempotencyKey },
    });

    if (existingPayment) {
      return {
        paymentId: existingPayment.id,
        status: existingPayment.status,
      };
    }

    const user = await UserService.getUserById(userId);
    if (!user) throw new Error('User not found');

    const currentBalance = Number(user.balance);
    if (currentBalance < amount) {
      throw new Error(`Insufficient wallet balance. Available: $${currentBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`);
    }

    const payment = await prisma.$transaction(async (tx) => {
      const createdPayment = await tx.payment.create({
        data: {
          idempotencyKey,
          orderId,
          userId,
          amount,
          currency,
          provider: this.providerName,
          status: PaymentStatus.PAID,
          transactionReference: `WALLET_TX_${Date.now()}`,
        },
      });

      // Deduct balance and log wallet transaction
      await UserService.updateBalance(
        userId,
        -amount,
        TransactionType.PURCHASE,
        `Payment for Order #${orderId}`,
        createdPayment.id
      );

      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: PaymentStatus.PAID, paymentMethod: this.providerName },
      });

      return createdPayment;
    });

    logger.info('Wallet payment processed successfully', { paymentId: payment.id, orderId, userId, amount });

    return {
      paymentId: payment.id,
      status: PaymentStatus.PAID,
      instructions: 'Paid instantly via Wallet balance.',
    };
  }

  async verifyPayment(paymentId: string): Promise<VerifyPaymentResult> {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error('Payment record not found');

    return {
      isVerified: payment.status === PaymentStatus.PAID,
      status: payment.status,
      transactionReference: payment.transactionReference || undefined,
    };
  }

  async refundPayment(paymentId: string): Promise<boolean> {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== PaymentStatus.PAID) return false;

    await prisma.$transaction(async (tx) => {
      await UserService.updateBalance(
        payment.userId,
        Number(payment.amount),
        TransactionType.REFUND,
        `Refund for Payment #${payment.id}`,
        payment.id
      );

      await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.REFUNDED },
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: PaymentStatus.REFUNDED },
      });
    });

    return true;
  }
}
