import { describe, it, expect, vi } from 'vitest';
import { ProductService } from '../services/productService.js';
import { prisma } from '../database/index.js';
import { ProductStatus } from '@prisma/client';

vi.mock('../database/index.js', () => ({
  prisma: {
    category: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    productVariant: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    stockItem: {
      count: vi.fn(),
    },
  },
}));

describe('ProductService Unit Tests', () => {
  it('should generate proper slug when creating a category', async () => {
    (prisma.category.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'cat-1', ...data })
    );

    const category = await ProductService.createCategory('Streaming Apps & TV!');
    expect(category.slug).toBe('streaming-apps-tv');
  });

  it('should fetch active products in category', async () => {
    (prisma.product.findMany as any).mockResolvedValue([
      { id: 'prod-1', name: 'Netflix Premium', status: ProductStatus.ACTIVE },
    ]);

    const products = await ProductService.getProductsByCategory('cat-1');
    expect(products.length).toBe(1);
    expect(products[0].name).toBe('Netflix Premium');
  });
});
