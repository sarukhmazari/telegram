import { IPaymentProvider, CreatePaymentResult, VerifyPaymentResult } from '../interfaces/paymentProvider.js';
export declare class WalletPaymentProvider implements IPaymentProvider {
    readonly providerName = "WALLET";
    createPayment(orderId: string, userId: string, amount: number, currency: string, idempotencyKey: string): Promise<CreatePaymentResult>;
    verifyPayment(paymentId: string): Promise<VerifyPaymentResult>;
    refundPayment(paymentId: string): Promise<boolean>;
}
