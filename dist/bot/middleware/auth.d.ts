import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../../types/context.js';
export declare const authMiddleware: MiddlewareFn<BotContext>;
export declare const adminGuard: MiddlewareFn<BotContext>;
