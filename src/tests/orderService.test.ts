import { describe, it, expect, vi } from 'vitest';
import { OrderService } from '../services/orderService.js';
import { CouponService } from '../services/couponService.js';

describe('OrderService Unit Tests', () => {
  it('should generate properly formatted order numbers', () => {
    const orderNumber = OrderService.generateOrderNumber();
    expect(orderNumber).toMatch(/^ORD-\d{8}-[A-Z0-9]{6}$/);
  });

  it('should calculate percentage coupon discount correctly', async () => {
    vi.spyOn(CouponService, 'validateCoupon').mockResolvedValue({
      isValid: true,
      coupon: {
        id: 'cpn-1',
        code: 'SAVE20',
        discountType: 'PERCENTAGE',
        discountValue: 20 as any,
        minOrderAmount: null,
        maxDiscountAmount: null,
        expiresAt: null,
        usageLimit: null,
        usageCount: 0,
        perUserLimit: 1,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      discountAmount: 10,
    });

    const validation = await CouponService.validateCoupon('SAVE20', 'usr-1', 50);
    expect(validation.isValid).toBe(true);
    expect(validation.discountAmount).toBe(10);
  });
});
