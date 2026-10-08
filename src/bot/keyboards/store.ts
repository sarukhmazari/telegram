import { Markup } from 'telegraf';
import { Category, Product, ProductVariant, DeliveryType } from '@prisma/client';

export function getCategoriesKeyboard(categories: Category[]) {
  const rows: any[] = [];
  
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

export function getProductsKeyboard(products: any[], categoryId: string) {
  const rows: any[] = products.map((prod) => {
    let priceBadge = '';
    let stockBadge = '';
    if (prod.variants && prod.variants.length > 0) {
      const lowestPrice = Math.min(...prod.variants.map((v: any) => Number(v.price)));
      const totalStock = prod.variants.reduce(
        (sum: number, v: any) => sum + (v._count?.stockItems ?? v.stockCount ?? 0),
        0
      );
      priceBadge = ` — Rs. ${lowestPrice.toFixed(0)}`;
      stockBadge = totalStock > 0 ? ` (Stock: ${totalStock})` : ' [Out of Stock]';
    }
    return [Markup.button.callback(`📦 ${prod.name}${priceBadge}${stockBadge}`, `prod_${prod.id}`)];
  });

  rows.push([
    Markup.button.callback('⬅️ Back to Categories', 'menu_store'),
    Markup.button.callback('🏠 Home', 'menu_main'),
  ]);

  return Markup.inlineKeyboard(rows);
}

export function getProductVariantsKeyboard(
  product: any,
  variants: any[],
  backTarget: string = 'menu_store'
) {
  const rows: any[] = variants.map((v) => {
    const stockCount = v._count?.stockItems ?? v.stockCount ?? 0;
    const stockBadge = stockCount > 0 ? ` (Stock: ${stockCount})` : ' [Out of Stock]';
    const deliveryBadge = v.deliveryType === DeliveryType.AUTOMATIC ? '⚡' : '🖐';
    const durationBadge = v.duration ? ` [${v.duration}]` : '';
    const priceStr = `Rs. ${Number(v.price).toFixed(0)}`;

    if (stockCount > 0) {
      return [
        Markup.button.callback(
          `💳 ${v.name}${durationBadge} — ${priceStr} ${deliveryBadge}${stockBadge}`,
          `buy_var_${v.id}`
        ),
      ];
    } else {
      return [
        Markup.button.callback(
          `⚠️ ${v.name}${durationBadge} — ${priceStr} [Out of Stock]`,
          'buy_zero_item'
        ),
      ];
    }
  });

  const backLabel = backTarget === 'menu_store' ? '⬅️ Back to Categories' : '⬅️ Back to Products';
  rows.push([
    Markup.button.callback(backLabel, backTarget),
    Markup.button.callback('🏠 Home', 'menu_main'),
  ]);

  return Markup.inlineKeyboard(rows);
}
