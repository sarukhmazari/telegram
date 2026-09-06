import { prisma } from '../database/index.js';
import { Review } from '@prisma/client';

export class ReviewService {
  static async createReview(
    orderId: string,
    productId: string,
    userId: string,
    rating: number,
    comment?: string
  ): Promise<Review> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5 stars');
    }

    return prisma.review.create({
      data: {
        orderId,
        productId,
        userId,
        rating,
        comment: comment || null,
        isApproved: true,
      },
    });
  }

  static async getProductAverageRating(productId: string): Promise<{ average: number; count: number }> {
    const reviews = await prisma.review.findMany({
      where: { productId, isApproved: true },
      select: { rating: true },
    });

    if (reviews.length === 0) {
      return { average: 0, count: 0 };
    }

    const total = reviews.reduce((sum, r) => sum + r.rating, 0);
    return {
      average: Number((total / reviews.length).toFixed(1)),
      count: reviews.length,
    };
  }
}
