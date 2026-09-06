import { IPaymentProvider, CreatePaymentResult, VerifyPaymentResult } from '../interfaces/paymentProvider.js';
export declare class TelegramPaymentProvider implements IPaymentProvider {
    readonly providerName = "TELEGRAM_PAYMENTS";
    createPayment(orderId: string, userId: string, amount: number, currency: string, idempotencyKey: string): Promise<CreatePaymentResult>;
    verifyPayment(paymentId: string, verificationData?: Record<string, any>): Promise<VerifyPaymentResult>;
    refundPayment(paymentId: string): Promise<boolean>;
}
