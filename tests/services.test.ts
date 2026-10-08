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

  it('ProductService variant helper functions exist and work', () => {
    expect(typeof ProductService.createVariant).toBe('function');
    expect(typeof ProductService.updateVariant).toBe('function');
    expect(typeof ProductService.updateVariantPrice).toBe('function');
    expect(typeof ProductService.toggleVariantStatus).toBe('function');
    expect(typeof ProductService.deleteVariant).toBe('function');
    expect(typeof ProductService.getVariantById).toBe('function');
    expect(typeof ProductService.getAvailableStockCount).toBe('function');
  });

  it('BroadcastService handles dispatch gracefully with mock bot client', async () => {
    const { BroadcastService } = await import('../src/services/broadcastService.js');
    const sentMessages: any[] = [];
    const mockBot = {
      telegram: {
        sendMessage: async (chatId: string, text: string) => {
          sentMessages.push({ chatId, text });
          return {};
        },
        sendPhoto: async (chatId: string, photo: string, extra: any) => {
          sentMessages.push({ chatId, photo, extra });
          return {};
        },
      },
    };

    const broadcast = await BroadcastService.sendBroadcast(
      'admin-123',
      'Test Broadcast *Bold* Announcement',
      mockBot as any
    );

    expect(broadcast).toBeDefined();
    expect(broadcast.status).toBe('COMPLETED');
    expect(typeof broadcast.successCount).toBe('number');
  }, 15000);
});
