import { prisma } from '../database/index.js';
import { ProductStatus } from '@prisma/client';
export class ProductService {
    // --- Category Operations ---
    static async getActiveCategories() {
        return prisma.category.findMany({
            where: { isEnabled: true },
            orderBy: { position: 'asc' },
            include: {
                _count: {
                    select: { products: true },
                },
            },
        });
    }
    static async getAllCategories() {
        return prisma.category.findMany({
            orderBy: { position: 'asc' },
        });
    }
    static async getCategoryById(id) {
        return prisma.category.findUnique({
            where: { id },
        });
    }
    static async createCategory(name, description, position = 0) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        return prisma.category.create({
            data: {
                name,
                slug,
                description: description || null,
                position,
            },
        });
    }
    // --- Product Operations ---
    static async getProductsByCategory(categoryId) {
        return prisma.product.findMany({
            where: {
                categoryId,
                status: ProductStatus.ACTIVE,
            },
            include: {
                variants: {
                    where: { isEnabled: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    static async getFeaturedProducts() {
        return prisma.product.findMany({
            where: {
                isFeatured: true,
                status: ProductStatus.ACTIVE,
            },
            include: {
                variants: {
                    where: { isEnabled: true },
                },
            },
        });
    }
    static async getProductById(id) {
        return prisma.product.findUnique({
            where: { id },
            include: {
                category: true,
                variants: {
                    where: { isEnabled: true },
                    include: {
                        stockItems: {
                            where: { isSold: false, lockedAt: null },
                        },
                    },
                },
                reviews: {
                    where: { isApproved: true },
                },
            },
        });
    }
    static async createProduct(categoryId, name, description, imageUrl, isFeatured = false) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        return prisma.product.create({
            data: {
                categoryId,
                name,
                slug,
                description,
                imageUrl: imageUrl || null,
                isFeatured,
            },
        });
    }
    // --- Variant Operations ---
    static async createVariant(productId, name, price, deliveryType, duration, description, currency = 'USD') {
        return prisma.productVariant.create({
            data: {
                productId,
                name,
                price,
                deliveryType,
                duration: duration || null,
                description: description || null,
                currency,
            },
        });
    }
    static async getAvailableStockCount(variantId) {
        return prisma.stockItem.count({
            where: {
                variantId,
                isSold: false,
                lockedAt: null,
            },
        });
    }
}
