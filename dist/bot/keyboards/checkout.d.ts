import { Markup } from 'telegraf';
export declare function getOrderConfirmationKeyboard(orderId: string, hasCoupon?: boolean): Markup.Markup<import("@telegraf/types").InlineKeyboardMarkup>;
export declare function getPaymentMethodKeyboard(orderId: string, isWalletEnabled?: boolean): Markup.Markup<import("@telegraf/types").InlineKeyboardMarkup>;
