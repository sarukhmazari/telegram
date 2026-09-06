import { Telegraf } from 'telegraf';
import { BotContext } from '../types/context.js';
export declare class BroadcastService {
    static sendBroadcast(adminId: string, messageText: string, bot: Telegraf<BotContext>, fileId?: string): Promise<{
        status: import("@prisma/client").$Enums.BroadcastStatus;
        id: string;
        createdAt: Date;
        fileId: string | null;
        adminId: string;
        messageText: string;
        targetCount: number;
        successCount: number;
        failCount: number;
    }>;
}
