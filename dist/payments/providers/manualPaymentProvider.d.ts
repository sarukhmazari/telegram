import { IPaymentProvider, CreatePaymentResult, VerifyPaymentResult } from '../interfaces/paymentProvider.js';
export declare class ManualPaymentProvider implements IPaymentProvider {
    readonly providerName = "MANUAL";
    createPayment(orderId: string, userId: string, amount: number, currency: string, idempotencyKey: string, metadata?: Record<string, any>): Promise<CreatePaymentResult>;
    verifyPayment(paymentId: string, verificationData?: Record<string, any>): Promise<VerifyPaymentResult>;
    refundPayment(paymentId: string): Promise<boolean>;
}
