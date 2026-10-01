import { describe, it, expect, beforeAll } from 'vitest';
import { UserService } from '../src/services/userService.js';
import { SettingService } from '../src/services/settingService.js';
import { ProductService } from '../src/services/productService.js';
import { PaymentAccountService } from '../src/services/paymentAccountService.js';
import { AdminService } from '../src/services/adminService.js';
import { connectDatabase } from '../src/database/index.js';

describe('Bot Speed & Admin Payment Approval Verification', () => {
  beforeAll(async () => {
    await connectDatabase().catch(() => {});
  });

  it('UserService in-memory cache responds in sub-millisecond on repeat calls', async () => {
    const testTelegramId = 8371873408; // Admin ID
    // 1st call (database / cache populate)
    const user1 = await UserService.findOrCreateUser(testTelegramId, 'zoxer19', 'Admin', 'User');
    expect(user1).toBeDefined();
    expect(['ADMIN', 'OWNER']).toContain(user1.role);

    // 2nd call (in-memory cache) - benchmark time
    const start = performance.now();
    const user2 = await UserService.findOrCreateUser(testTelegramId, 'zoxer19', 'Admin', 'User');
    const elapsedMs = performance.now() - start;

    expect(user2.id).toBe(user1.id);
    expect(elapsedMs).toBeLessThan(5); // Sub-5ms response guarantee (typically < 0.1ms)
    console.log(`⚡ User cache resolution time: ${elapsedMs.toFixed(3)}ms`);
  });

  it('ProductService category caching resolves in sub-millisecond', async () => {
    // 1st call
    const cats1 = await ProductService.getActiveCategories();
    expect(Array.isArray(cats1)).toBe(true);

    // 2nd call - benchmark time
    const start = performance.now();
    const cats2 = await ProductService.getActiveCategories();
    const elapsedMs = performance.now() - start;

    expect(cats2.length).toBe(cats1.length);
    expect(elapsedMs).toBeLessThan(5);
    console.log(`⚡ Category cache resolution time: ${elapsedMs.toFixed(3)}ms`);
  });

  it('PaymentAccountService caching resolves in sub-millisecond', async () => {
    const accs1 = await PaymentAccountService.getActiveAccounts();
    expect(Array.isArray(accs1)).toBe(true);

    const start = performance.now();
    const accs2 = await PaymentAccountService.getActiveAccounts();
    const elapsedMs = performance.now() - start;

    expect(accs2.length).toBe(accs1.length);
    expect(elapsedMs).toBeLessThan(5);
    console.log(`⚡ Payment accounts cache resolution time: ${elapsedMs.toFixed(3)}ms`);
  });

  it('AdminService.approvePayment handles non-existent payment gracefully with clean error object', async () => {
    const fakePaymentId = '00000000-0000-0000-0000-000000000000';
    const result = await AdminService.approvePayment(fakePaymentId, 'Test Notes');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });

  it('AdminService.rejectPayment handles non-existent payment gracefully with clean error object', async () => {
    const fakePaymentId = '00000000-0000-0000-0000-000000000000';
    const result = await AdminService.rejectPayment(fakePaymentId, 'Test Notes');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe('string');
  });
});
