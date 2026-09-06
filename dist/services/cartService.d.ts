export declare class CartService {
    static getCart(userId: string): Promise<{
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
            createdAt: Date;
            updatedAt: Date;
            variantId: string;
            quantity: number;
            cartId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
    static addItem(userId: string, variantId: string, quantity?: number): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        variantId: string;
        quantity: number;
        cartId: string;
    }>;
    static clearCart(userId: string): Promise<void>;
}
