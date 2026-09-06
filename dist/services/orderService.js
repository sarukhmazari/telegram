import { prisma } from '../database/index.js';
import { OrderStatus, PaymentStatus, DeliveryStatus } from '@prisma/client';
import { CouponService } from './couponService.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';
export class OrderService {
    static generateOrderNumber() {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `ORD-${dateStr}-${randomHex}`;
    }
    static async createOrder(params) {
        const { userId, variantId, quantity, couponCode, idempotencyKey } = params;
        // Idempotency check
        if (idempotencyKey) {
            const existingOrder = await prisma.order.findUnique({
                where: { idempotencyKey },
                include: {
                    items: { include: { variant: { include: { product: true } } } },
                    payments: true,
                },
            });
            if (existingOrder) {
                logger.info('Returned idempotent order', { orderId: existingOrder.id, idempotencyKey });
                return existingOrder;
            }
        }
        const variant = await prisma.productVariant.findUnique({
            where: { id: variantId },
            include: { product: true },
        });
        if (!variant || !variant.isEnabled) {
            throw new Error('Selected product variant is unavailable.');
        }
        const unitPrice = Number(variant.price);
        const rawTotal = unitPrice * quantity;
        let discountAmount = 0;
        let validCouponId = undefined;
        if (couponCode) {
            const validation = await CouponService.validateCoupon(couponCode, userId, rawTotal);
            if (validation.isValid && validation.coupon) {
                discountAmount = validation.discountAmount;
                validCouponId = validation.coupon.id;
            }
        }
        const finalTotal = Math.max(0, rawTotal - discountAmount);
        const orderNumber = this.generateOrderNumber();
        const order = await prisma.$transaction(async (tx) => {
            const createdOrder = await tx.order.create({
                data: {
                    orderNumber,
                    idempotencyKey: idempotencyKey || null,
                    userId,
                    totalAmount: finalTotal,
                    currency: variant.currency,
                    discountAmount,
                    couponId: validCouponId || null,
                    paymentStatus: PaymentStatus.PENDING,
                    orderStatus: OrderStatus.PENDING,
                    deliveryStatus: DeliveryStatus.PENDING,
                    items: {
                        create: [
                            {
                                variantId: variant.id,
                                quantity,
                                unitPrice,
                                totalPrice: rawTotal,
                            },
                        ],
                    },
                },
                include: {
                    items: { include: { variant: { include: { product: true } } } },
                },
            });
            if (validCouponId) {
                await CouponService.recordCouponUsage(validCouponId, userId);
            }
            return createdOrder;
        });
        logger.info('Created new order', { orderId: order.id, orderNumber, total: finalTotal });
        return order;
    }
    static async getOrderById(orderId) {
        return prisma.order.findUnique({
            where: { id: orderId },
            include: {
                user: true,
                items: { include: { variant: { include: { product: true } } } },
                payments: true,
                stockItems: true,
            },
        });
    }
    static async getOrderByNumber(orderNumber) {
        return prisma.order.findUnique({
            where: { orderNumber },
            include: {
                user: true,
                items: { include: { variant: { include: { product: true } } } },
                payments: true,
            },
        });
    }
    static async getUserOrders(userId, limit = 10) {
        return prisma.order.findMany({
            where: { userId },
            include: {
                items: { include: { variant: { include: { product: true } } } },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }
}
