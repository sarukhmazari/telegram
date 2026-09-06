import { IPaymentProvider } from '../payments/interfaces/paymentProvider.js';
export declare class PaymentService {
    private static providers;
    static registerProvider(provider: IPaymentProvider): void;
    static getProvider(name: string): IPaymentProvider;
}
