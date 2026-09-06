import { Review } from '@prisma/client';
export declare class ReviewService {
    static createReview(orderId: string, productId: string, userId: string, rating: number, comment?: string): Promise<Review>;
    static getProductAverageRating(productId: string): Promise<{
        average: number;
        count: number;
    }>;
}
