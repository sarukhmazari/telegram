import { Telegraf } from 'telegraf';
import { BotContext } from '../types/context.js';
export declare const bot: Telegraf<BotContext>;
export declare function startBot(): Promise<void>;
