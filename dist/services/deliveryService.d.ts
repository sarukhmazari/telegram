import { Telegraf } from 'telegraf';
import { BotContext } from '../types/context.js';
export declare class DeliveryService {
    /**
     * Process order delivery once payment is verified/PAID.
     */
    static processOrderDelivery(orderId: string, bot?: Telegraf<BotContext>): Promise<boolean>;
    private static processAutomaticDelivery;
    private static processManualDelivery;
    static notifyCustomerDelivery(bot: any, telegramId: bigint | number, orderNumber: string, productName: string, items: {
        content: string;
        fileId?: string | null;
    }[]): Promise<void>;
}
