import { prisma } from '../database/index.js';
import { Category, Product, ProductStatus, ProductVariant, DeliveryType } from '@prisma/client';
import { logger } from '../utils/logger.js';

let cachedActiveCategories: (Category & { _count: { products: number } })[] | null = null;
let cachedActiveCategoriesTime = 0;
let cachedAllCategories: Category[] | null = null;
let cachedAllCategoriesTime = 0;

const CACHE_TTL_MS = 60 * 1000; // 60 seconds

// In-memory caches for sub-millisecond response
const categoryDetailsCache = new Map<string, { data: any; time: number }>();
const productDetailsCache = new Map<string, { data: any; time: number }>();
const stockCountCache = new Map<string, { count: number; time: number }>();

export class ProductService {
  static invalidateCategoryCache() {
    cachedActiveCategories = null;
    cachedActiveCategoriesTime = 0;
    cachedAllCategories = null;
    cachedAllCategoriesTime = 0;
    categoryDetailsCache.clear();
    productDetailsCache.clear();
    stockCountCache.clear();
  }

  // --- Category Operations ---

  static async getActiveCategories(): Promise<(Category & { _count: { products: number } })[]> {
    const now = Date.now();
    if (cachedActiveCategories && now - cachedActiveCategoriesTime < CACHE_TTL_MS) {
      return cachedActiveCategories;
    }

    const categories = await prisma.category.findMany({
      where: { isEnabled: true },
      orderBy: { position: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    cachedActiveCategories = categories;
    cachedActiveCategoriesTime = now;
    return categories;
  }

  static async getAllCategories(): Promise<Category[]> {
    const now = Date.now();
    if (cachedAllCategories && now - cachedAllCategoriesTime < CACHE_TTL_MS) {
      return cachedAllCategories;
    }

    const categories = await prisma.category.findMany({
      orderBy: { position: 'asc' },
    });

    cachedAllCategories = categories;
    cachedAllCategoriesTime = now;
    return categories;
  }

  static async getCategoryById(id: string): Promise<Category | null> {
    const cached = categoryDetailsCache.get(id);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return cached.data;
    }

    const category = await prisma.category.findUnique({
      where: { id },
    });

    return category;
  }

  /**
   * Ultra-fast single-query method that loads Category + Active Products + Variants + Live Stock Count
   */
  static async getCategoryWithDetails(categoryId: string) {
    const now = Date.now();
    const cached = categoryDetailsCache.get(categoryId);
    if (cached && now - cached.time < CACHE_TTL_MS) {
      return cached.data;
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        products: {
          where: { status: ProductStatus.ACTIVE },
          orderBy: { createdAt: 'desc' },
          include: {
            variants: {
              where: { isEnabled: true },
              include: {
                _count: {
                  select: {
                    stockItems: {
                      where: { isSold: false, lockedAt: null },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (category) {
      categoryDetailsCache.set(categoryId, { data: category, time: now });
    }

    return category;
  }

  static async createCategory(name: string, description?: string, position: number = 0): Promise<Category> {
    ProductService.invalidateCategoryCache();
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
    const now = Date.now();
    const cached = productDetailsCache.get(id);
    if (cached && now - cached.time < CACHE_TTL_MS) {
      return cached.data;
    }

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: {
          where: { isEnabled: true },
          include: {
            _count: {
              select: {
                stockItems: {
                  where: { isSold: false, lockedAt: null },
                },
              },
            },
          },
        },
        reviews: {
          where: { isApproved: true },
        },
      },
    });

    if (product) {
      productDetailsCache.set(id, { data: product, time: now });
    }

    return product;
  }

  static async createProduct(
    categoryId: string,
    name: string,
    description: string,
    imageUrl?: string,
    isFeatured: boolean = false
  ): Promise<Product> {
    ProductService.invalidateCategoryCache();
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
    currency: string = 'PKR'
  ): Promise<ProductVariant> {
    ProductService.invalidateCategoryCache();
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
    const now = Date.now();
    const cached = stockCountCache.get(variantId);
    if (cached && now - cached.time < 15000) {
      return cached.count;
    }

    const count = await prisma.stockItem.count({
      where: {
        variantId,
        isSold: false,
        lockedAt: null,
      },
    });

    stockCountCache.set(variantId, { count, time: now });
    return count;
  }
}


