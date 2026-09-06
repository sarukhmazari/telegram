import { Telegraf } from 'telegraf';
import { BotContext } from '../types/context.js';
export interface DashboardMetrics {
    totalUsers: number;
    totalOrders: number;
    todaysOrders: number;
    totalRevenue: number;
    todaysRevenue: number;
    pendingPayments: number;
    pendingDeliveries: number;
    lowStockItemsCount: number;
}
export interface BulkImportResult {
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
}
export declare class AdminService {
    static getDashboardMetrics(): Promise<DashboardMetrics>;
    static importBulkStock(variantId: string, rawTextLines: string[], fileId?: string): Promise<BulkImportResult>;
    static approvePayment(paymentId: string, adminNotes?: string, bot?: Telegraf<BotContext>): Promise<boolean>;
    static rejectPayment(paymentId: string, adminNotes?: string, bot?: Telegraf<BotContext>): Promise<boolean>;
}
