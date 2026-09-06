import { PaymentStatus } from '@prisma/client';
export interface CreatePaymentResult {
    paymentId: string;
    status: PaymentStatus;
    instructions?: string;
    invoicePayload?: any;
}
export interface VerifyPaymentResult {
    isVerified: boolean;
    status: PaymentStatus;
    transactionReference?: string;
    adminNotes?: string;
}
export interface IPaymentProvider {
    readonly providerName: string;
    createPayment(orderId: string, userId: string, amount: number, currency: string, idempotencyKey: string, metadata?: Record<string, any>): Promise<CreatePaymentResult>;
    verifyPayment(paymentId: string, verificationData?: Record<string, any>): Promise<VerifyPaymentResult>;
    refundPayment(paymentId: string): Promise<boolean>;
}
