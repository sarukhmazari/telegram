import { describe, it, expect } from 'vitest';
import { PaymentService } from '../services/paymentService.js';

describe('PaymentService Unit Tests', () => {
  it('should resolve registered WALLET, MANUAL, and TELEGRAM payment providers', () => {
    const walletProvider = PaymentService.getProvider('WALLET');
    expect(walletProvider.providerName).toBe('WALLET');

    const manualProvider = PaymentService.getProvider('MANUAL');
    expect(manualProvider.providerName).toBe('MANUAL');

    const telegramProvider = PaymentService.getProvider('TELEGRAM_PAYMENTS');
    expect(telegramProvider.providerName).toBe('TELEGRAM_PAYMENTS');
  });

  it('should throw exception when resolving unregistered provider', () => {
    expect(() => PaymentService.getProvider('UNKNOWN_GATEWAY')).toThrow(
      "Payment provider 'UNKNOWN_GATEWAY' is not registered"
    );
  });
});
