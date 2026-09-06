import { Coupon } from '@prisma/client';
export interface CouponValidationResult {
    isValid: boolean;
    coupon?: Coupon;
    discountAmount: number;
    errorMessage?: string;
}
export declare class CouponService {
    static validateCoupon(code: string, userId: string, orderAmount: number): Promise<CouponValidationResult>;
    static recordCouponUsage(couponId: string, userId: string): Promise<void>;
}
