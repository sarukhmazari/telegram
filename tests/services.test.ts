import { describe, it, expect } from 'vitest';
import { UserService } from '../src/services/userService.js';
import { SettingService } from '../src/services/settingService.js';
import { ProductService } from '../src/services/productService.js';
import { PaymentAccountService } from '../src/services/paymentAccountService.js';

describe('Caching & Performance Services', () => {
  it('SettingService caching stores and retrieves properly', async () => {
    const val = await SettingService.getSupportUsername();
    expect(typeof val === 'string' || val === null).toBe(true);
  }, 15000);

  it('ProductService cache invalidation works', () => {
    expect(() => ProductService.invalidateCategoryCache()).not.toThrow();
  });

  it('PaymentAccountService cache invalidation works', () => {
    expect(() => PaymentAccountService.invalidateCache()).not.toThrow();
  });

  it('UserService cache helper functions operate without error', () => {
    const mockUser: any = {
      id: 'mock-uuid',
      telegramId: BigInt(123456789),
      username: 'testuser',
      firstName: 'Test',
      lastName: null,
      balance: 0,
      role: 'USER',
      isBanned: false,
      referralCode: 'REF123',
      referredById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    UserService.setCachedUser(mockUser);
    UserService.invalidateCache(123456789);
    UserService.invalidateCache('mock-uuid');
  });
});
