import { Category, Product, ProductVariant, DeliveryType } from '@prisma/client';
export declare class ProductService {
    static getActiveCategories(): Promise<(Category & {
        _count: {
            products: number;
        };
    })[]>;
    static getAllCategories(): Promise<Category[]>;
    static getCategoryById(id: string): Promise<Category | null>;
    static createCategory(name: string, description?: string, position?: number): Promise<Category>;
    static getProductsByCategory(categoryId: string): Promise<Product[]>;
    static getFeaturedProducts(): Promise<Product[]>;
    static getProductById(id: string): Promise<{
        reviews: {
            id: string;
            createdAt: Date;
            userId: string;
            productId: string;
            orderId: string;
            rating: number;
            comment: string | null;
            isApproved: boolean;
        }[];
        category: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            slug: string;
            description: string | null;
            position: number;
            isEnabled: boolean;
        };
        variants: ({
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
        })[];
    } & {
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
    }>;
    static createProduct(categoryId: string, name: string, description: string, imageUrl?: string, isFeatured?: boolean): Promise<Product>;
    static createVariant(productId: string, name: string, price: number, deliveryType: DeliveryType, duration?: string, description?: string, currency?: string): Promise<ProductVariant>;
    static getAvailableStockCount(variantId: string): Promise<number>;
}
