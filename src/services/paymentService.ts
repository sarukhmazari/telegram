import { IPaymentProvider } from '../payments/interfaces/paymentProvider.js';
import { WalletPaymentProvider } from '../payments/providers/walletPaymentProvider.js';
import { ManualPaymentProvider } from '../payments/providers/manualPaymentProvider.js';
import { TelegramPaymentProvider } from '../payments/providers/telegramPaymentProvider.js';

export class PaymentService {
  private static providers: Map<string, IPaymentProvider> = new Map();

  static registerProvider(provider: IPaymentProvider) {
    this.providers.set(provider.providerName.toUpperCase(), provider);
  }

  static getProvider(name: string): IPaymentProvider {
    const provider = this.providers.get(name.toUpperCase());
    if (!provider) {
      throw new Error(`Payment provider '${name}' is not registered`);
    }
    return provider;
  }
}

// Register default built-in providers
PaymentService.registerProvider(new WalletPaymentProvider());
PaymentService.registerProvider(new ManualPaymentProvider());
PaymentService.registerProvider(new TelegramPaymentProvider());
