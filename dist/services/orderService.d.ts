import { Order } from '@prisma/client';
export interface CreateOrderParams {
    userId: string;
    variantId: string;
    quantity: number;
    couponCode?: string;
    idempotencyKey?: string;
}
export declare class OrderService {
    static generateOrderNumber(): string;
    static createOrder(params: CreateOrderParams): Promise<Order>;
    static getOrderById(orderId: string): Promise<{
        payments: {
            status: import("@prisma/client").$Enums.PaymentStatus;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            idempotencyKey: string;
            userId: string;
            currency: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            orderId: string;
            provider: string;
            transactionReference: string | null;
            proofFileId: string | null;
            adminNotes: string | null;
        }[];
        user: {
            id: string;
            telegramId: bigint;
            username: string | null;
            referralCode: string;
            firstName: string | null;
            lastName: string | null;
            balance: import("@prisma/client/runtime/library").Decimal;
            role: import("@prisma/client").$Enums.Role;
            isBanned: boolean;
            referredById: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
        items: ({
            variant: {
                product: {
                    status: import("@prisma/client").$Enums.ProductStatus;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    name: string;
                    slug: string;
                    description: string;
                    categoryId: string;
                    imageUrl: string | null;
                    isFeatured: boolean;
                };
            } & {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                currency: string;
                description: string | null;
                isEnabled: boolean;
                productId: string;
                price: import("@prisma/client/runtime/library").Decimal;
                duration: string | null;
                deliveryType: import("@prisma/client").$Enums.DeliveryType;
            };
        } & {
            id: string;
            variantId: string;
            quantity: number;
            unitPrice: import("@prisma/client/runtime/library").Decimal;
            totalPrice: import("@prisma/client/runtime/library").Decimal;
            orderId: string;
        })[];
        stockItems: {
            content: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            variantId: string;
            orderId: string | null;
            fileId: string | null;
            isSold: boolean;
            lockedAt: Date | null;
            soldAt: Date | null;
        }[];
    } & {
        deliveryData: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        orderNumber: string;
        idempotencyKey: string | null;
        userId: string;
        totalAmount: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        discountAmount: import("@prisma/client/runtime/library").Decimal;
        couponId: string | null;
        paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
        orderStatus: import("@prisma/client").$Enums.OrderStatus;
        deliveryStatus: import("@prisma/client").$Enums.DeliveryStatus;
        paymentMethod: string | null;
        deliveredFileId: string | null;
    }>;
    static getOrderByNumber(orderNumber: string): Promise<{
        payments: {
            status: import("@prisma/client").$Enums.PaymentStatus;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            idempotencyKey: string;
            userId: string;
            currency: string;
            amount: import("@prisma/client/runtime/library").Decimal;
            orderId: string;
            provider: string;
            transactionReference: string | null;
            proofFileId: string | null;
            adminNotes: string | null;
        }[];
        user: {
            id: string;
            telegramId: bigint;
            username: string | null;
            referralCode: string;
            firstName: string | null;
            lastName: string | null;
            balance: import("@prisma/client/runtime/library").Decimal;
            role: import("@prisma/client").$Enums.Role;
            isBanned: boolean;
            referredById: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
        items: ({
            variant: {
                product: {
                    status: import("@prisma/client").$Enums.ProductStatus;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    name: string;
                    slug: string;
                    description: string;
                    categoryId: string;
                    imageUrl: string | null;
                    isFeatured: boolean;
                };
            } & {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                currency: string;
                description: string | null;
                isEnabled: boolean;
                productId: string;
                price: import("@prisma/client/runtime/library").Decimal;
                duration: string | null;
                deliveryType: import("@prisma/client").$Enums.DeliveryType;
            };
        } & {
            id: string;
            variantId: string;
            quantity: number;
            unitPrice: import("@prisma/client/runtime/library").Decimal;
            totalPrice: import("@prisma/client/runtime/library").Decimal;
            orderId: string;
        })[];
    } & {
        deliveryData: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        orderNumber: string;
        idempotencyKey: string | null;
        userId: string;
        totalAmount: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        discountAmount: import("@prisma/client/runtime/library").Decimal;
        couponId: string | null;
        paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
        orderStatus: import("@prisma/client").$Enums.OrderStatus;
        deliveryStatus: import("@prisma/client").$Enums.DeliveryStatus;
        paymentMethod: string | null;
        deliveredFileId: string | null;
    }>;
    static getUserOrders(userId: string, limit?: number): Promise<({
        items: ({
            variant: {
                product: {
                    status: import("@prisma/client").$Enums.ProductStatus;
                    id: string;
                    createdAt: Date;
                    updatedAt: Date;
                    name: string;
                    slug: string;
                    description: string;
                    categoryId: string;
                    imageUrl: string | null;
                    isFeatured: boolean;
                };
            } & {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                name: string;
                currency: string;
                description: string | null;
                isEnabled: boolean;
                productId: string;
                price: import("@prisma/client/runtime/library").Decimal;
                duration: string | null;
                deliveryType: import("@prisma/client").$Enums.DeliveryType;
            };
        } & {
            id: string;
            variantId: string;
            quantity: number;
            unitPrice: import("@prisma/client/runtime/library").Decimal;
            totalPrice: import("@prisma/client/runtime/library").Decimal;
            orderId: string;
        })[];
    } & {
        deliveryData: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        orderNumber: string;
        idempotencyKey: string | null;
        userId: string;
        totalAmount: import("@prisma/client/runtime/library").Decimal;
        currency: string;
        discountAmount: import("@prisma/client/runtime/library").Decimal;
        couponId: string | null;
        paymentStatus: import("@prisma/client").$Enums.PaymentStatus;
        orderStatus: import("@prisma/client").$Enums.OrderStatus;
        deliveryStatus: import("@prisma/client").$Enums.DeliveryStatus;
        paymentMethod: string | null;
        deliveredFileId: string | null;
    })[]>;
}
