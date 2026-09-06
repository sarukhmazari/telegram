import { prisma } from '../database/index.js';
import { Coupon, DiscountType } from '@prisma/client';
import { logger } from '../utils/logger.js';

export interface CouponValidationResult {
  isValid: boolean;
  coupon?: Coupon;
  discountAmount: number;
  errorMessage?: string;
}

export class CouponService {
  static async validateCoupon(
    code: string,
    userId: string,
    orderAmount: number
  ): Promise<CouponValidationResult> {
    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase().trim() },
    });

    if (!coupon || !coupon.isEnabled) {
      return { isValid: false, discountAmount: 0, errorMessage: 'Invalid or inactive coupon code.' };
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return { isValid: false, discountAmount: 0, errorMessage: 'Coupon code has expired.' };
    }

    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return { isValid: false, discountAmount: 0, errorMessage: 'Coupon usage limit reached.' };
    }

    if (coupon.minOrderAmount && orderAmount < Number(coupon.minOrderAmount)) {
      return {
        isValid: false,
        discountAmount: 0,
        errorMessage: `Minimum order amount of $${Number(coupon.minOrderAmount).toFixed(2)} required for this coupon.`,
      };
    }

    const userUsageCount = await prisma.couponUsage.count({
      where: { couponId: coupon.id, userId },
    });

    if (userUsageCount >= coupon.perUserLimit) {
      return { isValid: false, discountAmount: 0, errorMessage: 'You have already used this coupon.' };
    }

    let discount = 0;
    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discount = (orderAmount * Number(coupon.discountValue)) / 100;
      if (coupon.maxDiscountAmount && discount > Number(coupon.maxDiscountAmount)) {
        discount = Number(coupon.maxDiscountAmount);
      }
    } else {
      discount = Number(coupon.discountValue);
    }

    // Discount cannot exceed order amount
    discount = Math.min(discount, orderAmount);

    return {
      isValid: true,
      coupon,
      discountAmount: discount,
    };
  }

  static async recordCouponUsage(couponId: string, userId: string): Promise<void> {
    await prisma.$transaction([
      prisma.couponUsage.create({
        data: { couponId, userId },
      }),
      prisma.coupon.update({
        where: { id: couponId },
        data: { usageCount: { increment: 1 } },
      }),
    ]);
  }
}
