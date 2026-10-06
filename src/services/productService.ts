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

  static async generateUniqueCategorySlug(name: string): Promise<string> {
    let baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    if (!baseSlug) {
      baseSlug = `cat-${Date.now().toString(36)}`;
    }
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.category.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }
    return slug;
  }

  static async generateUniqueProductSlug(name: string): Promise<string> {
    let baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    if (!baseSlug) {
      baseSlug = `prod-${Date.now().toString(36)}`;
    }
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.product.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }
    return slug;
  }

  static async createCategory(name: string, description?: string, position: number = 0): Promise<Category> {
    ProductService.invalidateCategoryCache();
    const slug = await ProductService.generateUniqueCategorySlug(name);
    return prisma.category.create({
      data: {
        name,
        slug,
        description: description || null,
        position,
      },
    });
  }

  static async toggleCategoryStatus(id: string): Promise<Category | null> {
    ProductService.invalidateCategoryCache();
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) return null;
    return prisma.category.update({
      where: { id },
      data: { isEnabled: !cat.isEnabled },
    });
  }

  static async deleteCategory(id: string): Promise<{ success: boolean; message: string; isSoftDeleted?: boolean }> {
    ProductService.invalidateCategoryCache();
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        products: {
          include: {
            variants: {
              include: {
                orderItems: { select: { id: true }, take: 1 },
              },
            },
            reviews: { select: { id: true }, take: 1 },
          },
        },
      },
    });

    if (!category) {
      return { success: false, message: 'Category not found.' };
    }

    // Check if category or any of its products has past order history or reviews
    const hasOrders = category.products.some((p) => p.variants.some((v) => v.orderItems.length > 0));
    const hasReviews = category.products.some((p) => p.reviews.length > 0);

    if (hasOrders || hasReviews) {
      // Disable category and hide its products so old orders and invoices remain intact
      await prisma.$transaction([
        prisma.category.update({
          where: { id },
          data: { isEnabled: false },
        }),
        prisma.product.updateMany({
          where: { categoryId: id },
          data: { status: ProductStatus.DISABLED },
        }),
      ]);
      return {
        success: true,
        isSoftDeleted: true,
        message: `Category "${category.name}" has previous order history. To preserve sales history, it has been disabled and hidden from the store.`,
      };
    }

    // Safe to hard delete completely
    await prisma.category.delete({
      where: { id },
    });

    return {
      success: true,
      isSoftDeleted: false,
      message: `Category "${category.name}" and its products were successfully deleted.`,
    };
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
    const slug = await ProductService.generateUniqueProductSlug(name);
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

  static async toggleProductStatus(id: string): Promise<Product | null> {
    ProductService.invalidateCategoryCache();
    const prod = await prisma.product.findUnique({ where: { id } });
    if (!prod) return null;
    const newStatus = prod.status === ProductStatus.ACTIVE ? ProductStatus.DISABLED : ProductStatus.ACTIVE;
    return prisma.product.update({
      where: { id },
      data: { status: newStatus },
    });
  }

  static async deleteProduct(id: string): Promise<{ success: boolean; message: string; isSoftDeleted?: boolean }> {
    ProductService.invalidateCategoryCache();
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            orderItems: { select: { id: true }, take: 1 },
          },
        },
        reviews: { select: { id: true }, take: 1 },
      },
    });

    if (!product) {
      return { success: false, message: 'Product not found.' };
    }

    const hasOrders = product.variants.some((v) => v.orderItems.length > 0);
    const hasReviews = product.reviews.length > 0;

    if (hasOrders || hasReviews) {
      await prisma.product.update({
        where: { id },
        data: { status: ProductStatus.DISABLED },
      });
      return {
        success: true,
        isSoftDeleted: true,
        message: `Product "${product.name}" has customer order history. It has been disabled and hidden from the store.`,
      };
    }

    await prisma.product.delete({
      where: { id },
    });

    return {
      success: true,
      isSoftDeleted: false,
      message: `Product "${product.name}" was successfully deleted.`,
    };
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

  static async updateVariantPrice(variantId: string, newPrice: number): Promise<ProductVariant> {
    ProductService.invalidateCategoryCache();
    return prisma.productVariant.update({
      where: { id: variantId },
      data: { price: newPrice },
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


