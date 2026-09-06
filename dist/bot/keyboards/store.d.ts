import { Markup } from 'telegraf';
import { Category, Product, ProductVariant } from '@prisma/client';
export declare function getCategoriesKeyboard(categories: Category[]): Markup.Markup<import("@telegraf/types").InlineKeyboardMarkup>;
export declare function getProductsKeyboard(products: Product[], categoryId: string): Markup.Markup<import("@telegraf/types").InlineKeyboardMarkup>;
export declare function getProductVariantsKeyboard(product: Product, variants: (ProductVariant & {
    stockCount?: number;
})[]): Markup.Markup<import("@telegraf/types").InlineKeyboardMarkup>;
