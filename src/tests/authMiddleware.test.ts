import { describe, it, expect, vi } from 'vitest';
import { adminGuard } from '../bot/middleware/auth.js';

describe('adminGuard Middleware Unit Tests', () => {
  it('should allow admin users to proceed', async () => {
    const ctx: any = {
      isAdmin: true,
      session: { adminState: 'AWAITING_PRODUCT_NAME' },
    };
    const next = vi.fn();

    await adminGuard(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.session.adminState).toBe('AWAITING_PRODUCT_NAME');
  });

  it('should clear stale admin session state for non-admin users and allow normal commands', async () => {
    const ctx: any = {
      isAdmin: false,
      session: { adminState: 'AWAITING_PRODUCT_NAME', pendingStockLines: ['a:b'] },
    };
    const next = vi.fn();

    await adminGuard(ctx, next);

    expect(ctx.session.adminState).toBeUndefined();
    expect(ctx.session.pendingStockLines).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should reject non-admin users attempting explicit admin_ callback queries', async () => {
    const ctx: any = {
      isAdmin: false,
      callbackQuery: { data: 'admin_main' },
      answerCbQuery: vi.fn().mockResolvedValue(true),
      reply: vi.fn(),
    };
    const next = vi.fn();

    await adminGuard(ctx, next);

    expect(ctx.answerCbQuery).toHaveBeenCalledWith('⛔ Unauthorized: Admin access required.', { show_alert: true });
    expect(next).not.toHaveBeenCalled();
  });
});
