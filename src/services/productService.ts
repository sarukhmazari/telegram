import { prisma } from '../database/index.js';
import { Category, Product, ProductStatus, ProductVariant, DeliveryType } from '@prisma/client';
import { logger } from '../utils/logger.js';

export class ProductService {
  // --- Category Operations ---

  static async getActiveCategories(): Promise<(Category & { _count: { products: number } })[]> {
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

  static async getAllCategories(): Promise<Category[]> {
    return prisma.category.findMany({
      orderBy: { position: 'asc' },
    });
  }

  static async getCategoryById(id: string): Promise<Category | null> {
    return prisma.category.findUnique({
      where: { id },
    });
  }

  static async createCategory(name: string, description?: string, position: number = 0): Promise<Category> {
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

  static async getProductsByCategory(categoryId: string): Promise<Product[]> {
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

  static async getFeaturedProducts(): Promise<Product[]> {
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

  static async getProductById(id: string) {
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

  static async createProduct(
    categoryId: string,
    name: string,
    description: string,
    imageUrl?: string,
    isFeatured: boolean = false
  ): Promise<Product> {
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

  static async createVariant(
    productId: string,
    name: string,
    price: number,
    deliveryType: DeliveryType,
    duration?: string,
    description?: string,
    currency: string = 'USD'
  ): Promise<ProductVariant> {
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

  static async getAvailableStockCount(variantId: string): Promise<number> {
    return prisma.stockItem.count({
      where: {
        variantId,
        isSold: false,
        lockedAt: null,
      },
    });
  }
}
