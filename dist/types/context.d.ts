import { Context } from 'telegraf';
import { User } from '@prisma/client';
export interface SessionData {
    adminState?: string;
    adminData?: Record<string, any>;
    pendingStockLines?: string[];
    userState?: string;
    userData?: Record<string, any>;
    cartVariantId?: string;
    cartQuantity?: number;
}
export interface BotContext extends Context {
    session?: SessionData;
    dbUser?: User;
    isAdmin?: boolean;
}
