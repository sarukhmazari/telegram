import { Markup } from 'telegraf';
import { DeliveryType } from '@prisma/client';
export function getCategoriesKeyboard(categories) {
    const rows = [];
    for (let i = 0; i < categories.length; i += 2) {
        const name1 = categories[i].name;
        const label1 = /^[\p{Extended_Pictographic}\u{1F300}-\u{1F9FF}]/u.test(name1) ? name1 : `📁 ${name1}`;
        const row = [Markup.button.callback(label1, `cat_${categories[i].id}`)];
        if (i + 1 < categories.length) {
            const name2 = categories[i + 1].name;
            const label2 = /^[\p{Extended_Pictographic}\u{1F300}-\u{1F9FF}]/u.test(name2) ? name2 : `📁 ${name2}`;
            row.push(Markup.button.callback(label2, `cat_${categories[i + 1].id}`));
        }
        rows.push(row);
    }
    rows.push([Markup.button.callback('🏠 Home', 'menu_main')]);
    return Markup.inlineKeyboard(rows);
}
export function getProductsKeyboard(products, categoryId) {
    const rows = products.map((prod) => [
        Markup.button.callback(`📦 ${prod.name}`, `prod_${prod.id}`),
    ]);
    rows.push([
        Markup.button.callback('⬅️ Back to Categories', 'menu_store'),
        Markup.button.callback('🏠 Home', 'menu_main'),
    ]);
    return Markup.inlineKeyboard(rows);
}
export function getProductVariantsKeyboard(product, variants) {
    const rows = variants.map((v) => {
        const stockBadge = v.stockCount !== undefined ? ` (Stock: ${v.stockCount})` : '';
        const deliveryBadge = v.deliveryType === DeliveryType.AUTOMATIC ? '⚡ Auto' : '🖐 Manual';
        return [
            Markup.button.callback(`💳 ${v.name} — $${Number(v.price).toFixed(2)} [${deliveryBadge}]${stockBadge}`, `buy_var_${v.id}`),
        ];
    });
    rows.push([
        Markup.button.callback('⬅️ Back to Products', `cat_${product.categoryId}`),
        Markup.button.callback('🏠 Home', 'menu_main'),
    ]);
    return Markup.inlineKeyboard(rows);
}
