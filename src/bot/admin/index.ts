import { Composer, Markup } from 'telegraf';
import { BotContext } from '../../types/context.js';
import { adminGuard } from '../middleware/auth.js';
import {
  getAdminMainKeyboard,
  getPaymentReviewKeyboard,
  getAdminProductsKeyboard,
  getProductDetailKeyboard,
  getProductDeleteConfirmKeyboard,
  getAdminProductVariantsKeyboard,
  getAdminVariantDetailKeyboard,
  getVariantDeleteConfirmKeyboard,
  getSelectVariantForStockKeyboard,
  getAdminStockProductsKeyboard,
  getAdminStockProductPlansKeyboard,
  getAdminCategoriesKeyboard,
  getCategoryDetailKeyboard,
  getCategoryDeleteConfirmKeyboard,
  getBotSettingsKeyboard,
  getPaymentAccountsKeyboard,
  getPaymentAccountDetailKeyboard,
  getRolesManagementKeyboard,
  getRoleAssignmentKeyboard,
  getPreAuthRoleKeyboard,
  getAdminCouponsKeyboard,
  getCouponDetailKeyboard,
  getCouponDeleteConfirmKeyboard,
  getAdminUsersKeyboard,
  getUserDetailKeyboard,
  getAdminOrdersKeyboard,
  getOrderDetailKeyboard,
  getAdminReviewsKeyboard,
  getReviewDetailKeyboard,
} from '../keyboards/admin.js';
import { AdminService } from '../../services/adminService.js';
import { ProductService } from '../../services/productService.js';
import { BroadcastService } from '../../services/broadcastService.js';
import { PaymentAccountService } from '../../services/paymentAccountService.js';
import { UserService } from '../../services/userService.js';
import { SettingService } from '../../services/settingService.js';
import { prisma } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { PaymentStatus, DeliveryType, Role } from '@prisma/client';

export const adminComposer = new Composer<BotContext>();

// Apply admin auth guard to all routes in this composer
adminComposer.use(adminGuard);

// Universal helper to safely edit admin messages (supports photo captions, regular text, caption length limits, and markdown fallbacks)
export async function safeEditAdminMessage(ctx: BotContext, text: string, replyMarkup?: any) {
  const markup = replyMarkup?.reply_markup || replyMarkup;
  const isPhotoMessage = Boolean(ctx.callbackQuery?.message && 'photo' in ctx.callbackQuery.message);

  if (isPhotoMessage) {
    if (text.length <= 1000) {
      try {
        await ctx.editMessageCaption(text, {
          parse_mode: 'Markdown',
          reply_markup: markup,
        });
        return;
      } catch (err: any) {
        if (String(err?.message || err).includes('message is not modified')) return;
      }
    }
    // Caption too long (>1024) or caption editing failed -> delete photo message and send clean text reply
    try {
      await ctx.deleteMessage().catch(() => {});
    } catch {}
    try {
      await ctx.reply(text, {
        parse_mode: 'Markdown',
        reply_markup: markup,
      });
    } catch {
      await ctx.reply(text.replace(/[*_`\[\]]/g, ''), {
        reply_markup: markup,
      }).catch(() => {});
    }
    return;
  }

  // Regular text message
  try {
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: markup,
    });
  } catch (err: any) {
    const errStr = String(err?.message || err);
    if (errStr.includes('message is not modified')) {
      return;
    }
    try {
      const plainText = text.replace(/[*_`\[\]]/g, '');
      await ctx.editMessageText(plainText, { reply_markup: markup });
    } catch {
      try {
        await ctx.deleteMessage().catch(() => {});
      } catch {}
      await ctx.reply(text, {
        parse_mode: 'Markdown',
        reply_markup: markup,
      }).catch(async () => {
        await ctx.reply(text.replace(/[*_`\[\]]/g, ''), { reply_markup: markup }).catch(() => {});
      });
    }
  }
}

// ⚙️ /admin and /panel Commands for direct admin entry
adminComposer.command(['admin', 'panel'], async (ctx) => {
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }
  const msg = `⚙️ *Store Admin Panel*\n\nSelect a management option below:`;
  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    reply_markup: getAdminMainKeyboard().reply_markup,
  });
});

// ⚙️ Admin Main Menu
adminComposer.action('admin_main', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }
  const msg = `⚙️ *Store Admin Panel*\n\nSelect a management option below:`;
  await safeEditAdminMessage(ctx, msg, getAdminMainKeyboard());
});

// 📊 Dashboard Metrics
adminComposer.action('admin_dashboard', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const metrics = await AdminService.getDashboardMetrics();

  const msg =
    `📊 *Store Analytics & Dashboard*\n\n` +
    `👥 *Total Customers*: ${metrics.totalUsers}\n` +
    `📦 *Total Orders*: ${metrics.totalOrders}\n` +
    `📅 *Today's Orders*: ${metrics.todaysOrders}\n\n` +
    `💰 *Total Revenue*: Rs. ${metrics.totalRevenue.toFixed(2)}\n` +
    `💵 *Today's Revenue*: Rs. ${metrics.todaysRevenue.toFixed(2)}\n\n` +
    `⏳ *Pending Payments*: ${metrics.pendingPayments}\n` +
    `📦 *Pending Deliveries*: ${metrics.pendingDeliveries}\n` +
    `⚠️ *Low Stock Items*: ${metrics.lowStockItemsCount}`;

  await safeEditAdminMessage(ctx, msg, getAdminMainKeyboard());
});

// 📦 Products Management Screen
adminComposer.action('admin_products', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      category: true,
      variants: {
        include: {
          _count: {
            select: { stockItems: { where: { isSold: false, lockedAt: null } } },
          },
        },
      },
    },
    take: 30,
  });
  const msg = `📦 *Product Management*\n\nTap any product below to manage sub-categories / plans, pricing, stock, enable/disable, or delete it.\nTotal Products: ${products.length}`;
  await safeEditAdminMessage(ctx, msg, getAdminProductsKeyboard(products));
});

// 📦 View Product Details
adminComposer.action(/^admin_prod_view_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }
  const prodId = ctx.match[1];
  const product = await prisma.product.findUnique({
    where: { id: prodId },
    include: {
      category: true,
      variants: {
        orderBy: { createdAt: 'asc' },
        include: {
          _count: {
            select: { stockItems: { where: { isSold: false, lockedAt: null } } },
          },
        },
      },
    },
  });

  if (!product) {
    await ctx.answerCbQuery('Product not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const variants = product.variants || [];
  const totalStock = variants.reduce(
    (sum, v) => sum + (v._count?.stockItems ?? 0),
    0
  );
  const statusStr = product.status === 'ACTIVE' ? '✅ Active (Shown in Store)' : '⏸ Disabled (Hidden)';

  let plansText = '';
  if (variants.length === 0) {
    plansText = `⚠️ _No sub-categories or plans added yet. Press "➕ Add Sub-Category" below._\n`;
  } else {
    plansText = `*Sub-Categories / Plans (${variants.length}):*\n`;
    variants.forEach((v, idx) => {
      const vStatus = v.isEnabled ? '✅' : '⏸';
      const durationStr = v.duration ? ` [${v.duration}]` : '';
      const deliveryStr = v.deliveryType === 'AUTOMATIC' ? '⚡ Auto' : '🖐 Manual';
      plansText += `${idx + 1}. ${vStatus} *${v.name}* — Rs. ${Number(v.price).toFixed(2)} PKR${durationStr} (Stock: ${v._count?.stockItems ?? 0} | ${deliveryStr})\n`;
    });
  }

  const msg =
    `📦 *Product Details*\n\n` +
    `• *Name:* ${product.name}\n` +
    `• *Category:* ${product.category?.name || 'N/A'}\n` +
    `• *Total Live Stock:* *${totalStock} items*\n` +
    `• *Status:* ${statusStr}\n` +
    `• *Description:* ${product.description || 'N/A'}\n\n` +
    `${plansText}\n` +
    `Select an action below:`;

  await safeEditAdminMessage(ctx, msg, getProductDetailKeyboard(product));
});

// 🗂 View All Sub-Categories / Plans of a Product
adminComposer.action(/^admin_prod_vars_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }
  const prodId = ctx.match[1];
  const product = await prisma.product.findUnique({
    where: { id: prodId },
    include: {
      category: true,
      variants: {
        orderBy: { createdAt: 'asc' },
        include: {
          _count: {
            select: { stockItems: { where: { isSold: false, lockedAt: null } } },
          },
        },
      },
    },
  });

  if (!product) {
    await ctx.answerCbQuery('Product not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const variants = product.variants || [];
  const msg =
    `🗂 *Sub-Categories & Plans — ${product.name}*\n\n` +
    `Manage pricing, warranties, delivery types, and stock for each plan.\n` +
    `Tap any plan below to edit its name, warranty duration, price, or remove it:\n\n` +
    `Total Plans: *${variants.length}*`;

  await safeEditAdminMessage(ctx, msg, getAdminProductVariantsKeyboard(product, variants));
});

// 🏷 View Single Sub-Category / Plan Detail
adminComposer.action(/^admin_var_view_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }
  const variantId = ctx.match[1];
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: { include: { category: true } },
      _count: {
        select: { stockItems: { where: { isSold: false, lockedAt: null } } },
      },
    },
  });

  if (!variant) {
    await ctx.answerCbQuery('Sub-category not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const stockCount = variant._count?.stockItems ?? 0;
  const statusStr = variant.isEnabled ? '✅ Active (Shown to Customers)' : '⏸ Disabled (Hidden)';
  const deliveryStr = variant.deliveryType === 'AUTOMATIC' ? '⚡ Instant Automatic Delivery' : '🖐 Manual Delivery';

  const msg =
    `🏷 *Sub-Category / Plan Details*\n\n` +
    `• *Product:* ${variant.product.name}\n` +
    `• *Plan Name:* *${variant.name}*\n` +
    `• *Category:* ${variant.product.category?.name || 'N/A'}\n` +
    `• *Price:* *Rs. ${Number(variant.price).toFixed(2)} PKR*\n` +
    `• *Warranty / Duration Details:* ${variant.duration || '_(Not set)_'}\n` +
    `• *Delivery Mode:* ${deliveryStr}\n` +
    `• *Live Stock Available:* *${stockCount} accounts/keys*\n` +
    `• *Status:* ${statusStr}\n` +
    (variant.description ? `• *Plan Notes:* ${variant.description}\n` : '') +
    `\nSelect an action below:`;

  await safeEditAdminMessage(ctx, msg, getAdminVariantDetailKeyboard(variant));
});

// 🔄 Toggle Sub-Category / Plan Enabled Status
adminComposer.action(/^admin_var_toggle_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const variantId = ctx.match[1];
  const updated = await ProductService.toggleVariantStatus(variantId);
  if (!updated) {
    await ctx.answerCbQuery('Sub-category not found.', { show_alert: true }).catch(() => {});
    return;
  }

  await ctx.answerCbQuery(updated.isEnabled ? '✅ Plan Enabled!' : '⏸ Plan Disabled!').catch(() => {});

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: { include: { category: true } },
      _count: { select: { stockItems: { where: { isSold: false, lockedAt: null } } } },
    },
  });

  if (!variant) return;

  const stockCount = variant._count?.stockItems ?? 0;
  const statusStr = variant.isEnabled ? '✅ Active (Shown to Customers)' : '⏸ Disabled (Hidden)';
  const deliveryStr = variant.deliveryType === 'AUTOMATIC' ? '⚡ Instant Automatic Delivery' : '🖐 Manual Delivery';

  const msg =
    `🏷 *Sub-Category / Plan Details*\n\n` +
    `• *Product:* ${variant.product.name}\n` +
    `• *Plan Name:* *${variant.name}*\n` +
    `• *Category:* ${variant.product.category?.name || 'N/A'}\n` +
    `• *Price:* *Rs. ${Number(variant.price).toFixed(2)} PKR*\n` +
    `• *Warranty / Duration Details:* ${variant.duration || '_(Not set)_'}\n` +
    `• *Delivery Mode:* ${deliveryStr}\n` +
    `• *Live Stock Available:* *${stockCount} accounts/keys*\n` +
    `• *Status:* ${statusStr}\n` +
    (variant.description ? `• *Plan Notes:* ${variant.description}\n` : '') +
    `\nSelect an action below:`;

  await safeEditAdminMessage(ctx, msg, getAdminVariantDetailKeyboard(variant));
});

// ⚡ / 🖐 Toggle Sub-Category Delivery Type (Auto vs Manual)
adminComposer.action(/^admin_var_toggle_delivery_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const variantId = ctx.match[1];
  const current = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!current) return;

  const newDelivery = current.deliveryType === 'AUTOMATIC' ? DeliveryType.MANUAL : DeliveryType.AUTOMATIC;
  const updated = await ProductService.updateVariant(variantId, { deliveryType: newDelivery });

  const label = updated.deliveryType === 'AUTOMATIC' ? '⚡ Instant Auto Delivery' : '🖐 Manual Delivery';
  await ctx.answerCbQuery(`Delivery changed to: ${label}`, { show_alert: true }).catch(() => {});

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: { include: { category: true } },
      _count: { select: { stockItems: { where: { isSold: false, lockedAt: null } } } },
    },
  });

  if (!variant) return;

  const stockCount = variant._count?.stockItems ?? 0;
  const statusStr = variant.isEnabled ? '✅ Active (Shown to Customers)' : '⏸ Disabled (Hidden)';
  const deliveryStr = variant.deliveryType === 'AUTOMATIC' ? '⚡ Instant Automatic Delivery' : '🖐 Manual Delivery';

  const msg =
    `🏷 *Sub-Category / Plan Details*\n\n` +
    `• *Product:* ${variant.product.name}\n` +
    `• *Plan Name:* *${variant.name}*\n` +
    `• *Category:* ${variant.product.category?.name || 'N/A'}\n` +
    `• *Price:* *Rs. ${Number(variant.price).toFixed(2)} PKR*\n` +
    `• *Warranty / Duration Details:* ${variant.duration || '_(Not set)_'}\n` +
    `• *Delivery Mode:* ${deliveryStr}\n` +
    `• *Live Stock Available:* *${stockCount} accounts/keys*\n` +
    `• *Status:* ${statusStr}\n` +
    (variant.description ? `• *Plan Notes:* ${variant.description}\n` : '') +
    `\nSelect an action below:`;

  await safeEditAdminMessage(ctx, msg, getAdminVariantDetailKeyboard(variant));
});

// 🗑 Confirm Sub-Category Removal
adminComposer.action(/^admin_var_del_confirm_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const variantId = ctx.match[1];
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });

  if (!variant) {
    await ctx.answerCbQuery('Sub-category not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const msg =
    `⚠️ *Confirm Sub-Category Removal*\n\n` +
    `Are you sure you want to remove plan *"${variant.name}"* from *"${variant.product.name}"*?\n\n` +
    `_Note: If this plan has past orders, it will be safely disabled & hidden from store to preserve past invoices._`;

  await safeEditAdminMessage(ctx, msg, getVariantDeleteConfirmKeyboard(variantId, variant.productId));
});

// 🗑 Execute Sub-Category Removal
adminComposer.action(/^admin_var_delete_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const variantId = ctx.match[1];
  const result = await ProductService.deleteVariant(variantId);

  await ctx.answerCbQuery(result.message, { show_alert: true }).catch(() => {});

  const prodId = result.productId;
  if (!prodId) {
    await safeEditAdminMessage(ctx, `✅ ${result.message}`, getAdminMainKeyboard());
    return;
  }

  const product = await prisma.product.findUnique({
    where: { id: prodId },
    include: {
      category: true,
      variants: {
        orderBy: { createdAt: 'asc' },
        include: {
          _count: {
            select: { stockItems: { where: { isSold: false, lockedAt: null } } },
          },
        },
      },
    },
  });

  if (!product) return;

  const msg =
    `${result.success ? '✅' : '⚠️'} ${result.message}\n\n` +
    `🗂 *Remaining Sub-Categories for ${product.name} (${product.variants.length}):*`;

  await safeEditAdminMessage(ctx, msg, getAdminProductVariantsKeyboard(product, product.variants));
});

// ➕ Add New Sub-Category / Plan Wizard — Step 1: Prompt Name
adminComposer.action(/^admin_var_add_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const productId = ctx.match[1];
  const product = await ProductService.getProductById(productId);

  if (!product) {
    await ctx.answerCbQuery('Product not found.', { show_alert: true }).catch(() => {});
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_NEW_VAR_NAME';
  ctx.session.adminData = { productId, productName: product.name };

  const promptMsg =
    `➕ *Add Sub-Category / Plan to ${product.name} (Step 1/3)*\n\n` +
    `Reply with the *Plan / Sub-Category Name*:\n\n` +
    `Examples:\n` +
    `• \`1 Month (20 Days Warranty)\`\n` +
    `• \`1 Month (30 Days Full Warranty)\`\n` +
    `• \`3 Months Private Account\`\n` +
    `• \`1 Year License Key\``;

  await safeEditAdminMessage(
    ctx,
    promptMsg,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', `admin_prod_vars_${productId}`)]])
  );
});

// 💰 Edit Sub-Category Price Prompt
adminComposer.action(/^admin_var_edit_price_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const variantId = ctx.match[1];
  const variant = await ProductService.getVariantById(variantId);

  if (!variant) {
    await ctx.answerCbQuery('Sub-category not found.', { show_alert: true }).catch(() => {});
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_VAR_EDIT_PRICE';
  ctx.session.adminData = {
    variantId,
    productName: variant.product.name,
    variantName: variant.name,
    productId: variant.productId,
  };

  const promptText =
    `💰 *Edit Price — ${variant.product.name} (${variant.name})*\n\n` +
    `Current Price: *Rs. ${Number(variant.price).toFixed(2)} PKR*\n\n` +
    `Reply with the *new price in PKR* (e.g. \`800\` or \`1500\`):`;

  await safeEditAdminMessage(
    ctx,
    promptText,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', `admin_var_view_${variantId}`)]])
  );
});

// 🏷 Edit Sub-Category Name Prompt
adminComposer.action(/^admin_var_edit_name_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const variantId = ctx.match[1];
  const variant = await ProductService.getVariantById(variantId);

  if (!variant) {
    await ctx.answerCbQuery('Sub-category not found.', { show_alert: true }).catch(() => {});
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_VAR_EDIT_NAME';
  ctx.session.adminData = {
    variantId,
    productName: variant.product.name,
    variantName: variant.name,
    productId: variant.productId,
  };

  const promptText =
    `🏷 *Edit Plan Name — ${variant.product.name}*\n\n` +
    `Current Name: *${variant.name}*\n\n` +
    `Reply with the *new name* (e.g. \`1 Month (20 Days Warranty)\`):`;

  await safeEditAdminMessage(
    ctx,
    promptText,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', `admin_var_view_${variantId}`)]])
  );
});

// 📝 Edit Sub-Category Warranty / Details Prompt
adminComposer.action(/^admin_var_edit_details_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const variantId = ctx.match[1];
  const variant = await ProductService.getVariantById(variantId);

  if (!variant) {
    await ctx.answerCbQuery('Sub-category not found.', { show_alert: true }).catch(() => {});
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_VAR_EDIT_DETAILS';
  ctx.session.adminData = {
    variantId,
    productName: variant.product.name,
    variantName: variant.name,
    productId: variant.productId,
  };

  const promptText =
    `📝 *Edit Warranty / Details — ${variant.product.name} (${variant.name})*\n\n` +
    `Current Details: *${variant.duration || 'None'}*\n\n` +
    `Reply with the *warranty duration or plan details* (e.g. \`20 Days Replacement Warranty\` or \`Private Profile - UHD\`), or send \`clear\` to reset:`;

  await safeEditAdminMessage(
    ctx,
    promptText,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', `admin_var_view_${variantId}`)]])
  );
});

// 📥 Select Sub-Category / Plan for Product Stock Upload Menu
adminComposer.action(/^admin_prod_stock_menu_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const prodId = ctx.match[1];
  const product = await prisma.product.findUnique({
    where: { id: prodId },
    include: {
      variants: {
        orderBy: { createdAt: 'asc' },
        include: {
          _count: {
            select: { stockItems: { where: { isSold: false, lockedAt: null } } },
          },
        },
      },
    },
  });

  if (!product) {
    await ctx.answerCbQuery('Product not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const variants = product.variants || [];
  if (variants.length === 0) {
    await safeEditAdminMessage(
      ctx,
      `⚠️ *${product.name}* does not have any sub-categories/plans yet.\n\nPlease add a sub-category/plan first!`,
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Add Sub-Category / Plan', `admin_var_add_${product.id}`)],
        [Markup.button.callback('⬅️ Back to Product', `admin_prod_view_${product.id}`)],
      ])
    );
    return;
  }

  const msg =
    `📥 *Add Stock to ${product.name}*\n\n` +
    `Select the specific sub-category / plan you want to add accounts or keys to:`;

  await safeEditAdminMessage(ctx, msg, getSelectVariantForStockKeyboard(product, variants));
});

// 📦 Toggle Product Status (Active / Disabled)
adminComposer.action(/^admin_prod_toggle_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const prodId = ctx.match[1];
  const updated = await ProductService.toggleProductStatus(prodId);
  if (!updated) {
    await ctx.answerCbQuery('Product not found.', { show_alert: true }).catch(() => {});
    return;
  }

  await ctx.answerCbQuery(updated.status === 'ACTIVE' ? '✅ Product Enabled!' : '⏸ Product Disabled!').catch(() => {});

  const product = await prisma.product.findUnique({
    where: { id: prodId },
    include: {
      category: true,
      variants: {
        orderBy: { createdAt: 'asc' },
        include: {
          _count: { select: { stockItems: { where: { isSold: false, lockedAt: null } } } },
        },
      },
    },
  });

  if (!product) return;

  const variants = product.variants || [];
  const totalStock = variants.reduce((sum, v) => sum + (v._count?.stockItems ?? 0), 0);
  const statusStr = product.status === 'ACTIVE' ? '✅ Active (Shown in Store)' : '⏸ Disabled (Hidden)';

  let plansText = '';
  if (variants.length === 0) {
    plansText = `⚠️ _No sub-categories or plans added yet. Press "➕ Add Sub-Category" below._\n`;
  } else {
    plansText = `*Sub-Categories / Plans (${variants.length}):*\n`;
    variants.forEach((v, idx) => {
      const vStatus = v.isEnabled ? '✅' : '⏸';
      const durationStr = v.duration ? ` [${v.duration}]` : '';
      const deliveryStr = v.deliveryType === 'AUTOMATIC' ? '⚡ Auto' : '🖐 Manual';
      plansText += `${idx + 1}. ${vStatus} *${v.name}* — Rs. ${Number(v.price).toFixed(2)} PKR${durationStr} (Stock: ${v._count?.stockItems ?? 0} | ${deliveryStr})\n`;
    });
  }

  const msg =
    `📦 *Product Details*\n\n` +
    `• *Name:* ${product.name}\n` +
    `• *Category:* ${product.category?.name || 'N/A'}\n` +
    `• *Total Live Stock:* *${totalStock} items*\n` +
    `• *Status:* ${statusStr}\n` +
    `• *Description:* ${product.description || 'N/A'}\n\n` +
    `${plansText}\n` +
    `Select an option below:`;

  await safeEditAdminMessage(ctx, msg, getProductDetailKeyboard(product));
});

// 🗑 Confirm Product Deletion
adminComposer.action(/^admin_prod_del_confirm_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const prodId = ctx.match[1];
  const product = await ProductService.getProductById(prodId);
  if (!product) {
    await ctx.answerCbQuery('Product not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const msg =
    `⚠️ *Confirm Product Deletion*\n\n` +
    `Are you sure you want to delete *"${product.name}"*?\n\n` +
    `_Note: If this product has past customer orders, it will be safely disabled & hidden from the store to preserve order receipts._`;

  await safeEditAdminMessage(ctx, msg, getProductDeleteConfirmKeyboard(prodId));
});

// 🗑 Execute Product Deletion
adminComposer.action(/^admin_prod_delete_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const prodId = ctx.match[1];
  const result = await ProductService.deleteProduct(prodId);

  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    include: { category: true, variants: true },
    take: 30,
  });

  const text = `${result.success ? '✅' : '⚠️'} ${result.message}\n\n📦 *Remaining Products (${products.length}):*`;
  await safeEditAdminMessage(ctx, text, getAdminProductsKeyboard(products));
});

// 🗂 Categories Management Screen
adminComposer.action('admin_categories', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const categories = await prisma.category.findMany({
    orderBy: { position: 'asc' },
    include: {
      _count: {
        select: { products: true },
      },
    },
  });
  const text = `🗂 *Category Management*\n\nTap any category below to manage, enable/disable, or delete it.\nTotal Categories: ${categories.length}`;
  await safeEditAdminMessage(ctx, text, getAdminCategoriesKeyboard(categories));
});

// 🗂 View Category Details
adminComposer.action(/^admin_cat_view_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const catId = ctx.match[1];
  const category = await prisma.category.findUnique({
    where: { id: catId },
    include: {
      products: true,
      _count: { select: { products: true } },
    },
  });

  if (!category) {
    await ctx.answerCbQuery('Category not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const statusStr = category.isEnabled ? '✅ Active (Shown in Store)' : '⏸ Disabled (Hidden from Store)';
  const msg =
    `🗂 *Category Details*\n\n` +
    `📁 *Name:* ${category.name}\n` +
    `🔗 *Slug:* \`${category.slug}\`\n` +
    `📊 *Status:* ${statusStr}\n` +
    `📦 *Products:* ${category.products.length} products\n\n` +
    `Select an action below:`;

  await safeEditAdminMessage(ctx, msg, getCategoryDetailKeyboard(category));
});

// 🗂 Toggle Category Enabled / Disabled
adminComposer.action(/^admin_cat_toggle_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const catId = ctx.match[1];
  const updated = await ProductService.toggleCategoryStatus(catId);
  if (!updated) {
    await ctx.answerCbQuery('Category not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const statusAlert = updated.isEnabled ? '✅ Category Enabled!' : '⏸ Category Disabled!';
  await ctx.answerCbQuery(statusAlert).catch(() => {});

  const category = await prisma.category.findUnique({
    where: { id: catId },
    include: { products: true, _count: { select: { products: true } } },
  });

  const statusStr = category?.isEnabled ? '✅ Active (Shown in Store)' : '⏸ Disabled (Hidden from Store)';
  const msg =
    `🗂 *Category Details*\n\n` +
    `📁 *Name:* ${category?.name}\n` +
    `🔗 *Slug:* \`${category?.slug}\`\n` +
    `📊 *Status:* ${statusStr}\n` +
    `📦 *Products:* ${category?.products.length || 0} products\n\n` +
    `Select an action below:`;

  await safeEditAdminMessage(ctx, msg, getCategoryDetailKeyboard(category));
});

// 🗑 Confirm Category Deletion
adminComposer.action(/^admin_cat_del_confirm_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const catId = ctx.match[1];
  const category = await ProductService.getCategoryById(catId);
  if (!category) {
    await ctx.answerCbQuery('Category not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const msg =
    `⚠️ *Confirm Category Deletion*\n\n` +
    `Are you sure you want to delete category *"${category.name}"*?\n\n` +
    `_Note: If this category has past customer orders, it will be safely disabled & hidden from the store instead of deleting past invoices._`;

  await safeEditAdminMessage(ctx, msg, getCategoryDeleteConfirmKeyboard(catId));
});

// 🗑 Execute Category Deletion
adminComposer.action(/^admin_cat_delete_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const catId = ctx.match[1];
  const result = await ProductService.deleteCategory(catId);

  const categories = await prisma.category.findMany({
    orderBy: { position: 'asc' },
    include: { _count: { select: { products: true } } },
  });

  const text = `${result.success ? '✅' : '⚠️'} ${result.message}\n\n🗂 *Categories Remaining (${categories.length}):*`;
  await safeEditAdminMessage(ctx, text, getAdminCategoriesKeyboard(categories));
});

// ➕ Add New Category Action
adminComposer.action('admin_add_category', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_CATEGORY_NAME';

  await safeEditAdminMessage(
    ctx,
    '➕ *Add New Store Category*\n\nPlease reply with the category name (e.g., `🍿 Disney+` or `🎮 PlayStation`):',
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_categories')]])
  );
});

// ➕ Add New Product Action — Step 1: Select Category
adminComposer.action('admin_add_product', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const categories = await ProductService.getActiveCategories();
  if (categories.length === 0) {
    await ctx.answerCbQuery('Please add at least one category first!', { show_alert: true }).catch(() => {});
    return;
  }

  const buttons = categories.map((c) => [
    Markup.button.callback(`${c.name}`, `admin_select_cat_${c.id}`),
  ]);
  buttons.push([Markup.button.callback('❌ Cancel', 'admin_products')]);

  await safeEditAdminMessage(
    ctx,
    '➕ *Add New Product (Step 1/3)*\n\nSelect the category for the new product:',
    Markup.inlineKeyboard(buttons)
  );
});

// ➕ Add New Product — Step 2: Category Selected -> Ask Product Name
adminComposer.action(/^admin_select_cat_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const categoryId = ctx.match[1];
  const category = await ProductService.getCategoryById(categoryId);

  if (!category) {
    await ctx.answerCbQuery('Category not found.').catch(() => {});
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_PRODUCT_NAME';
  ctx.session.adminData = { categoryId, categoryName: category.name };

  await safeEditAdminMessage(
    ctx,
    `➕ *Add New Product to ${category.name} (Step 2/3)*\n\nPlease reply with the *Product Name* (e.g. \`ChatGPT Plus 1 Month Private Account\`):`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_products')]])
  );
});

// 💳 Pending Payments Review
adminComposer.action('admin_payments', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const pendingPayments = await prisma.payment.findMany({
    where: { status: PaymentStatus.WAITING_FOR_VERIFICATION },
    include: { user: true, order: true },
    orderBy: { createdAt: 'asc' },
    take: 5,
  });

  if (pendingPayments.length === 0) {
    await safeEditAdminMessage(
      ctx,
      '💳 *Payment Reviews*\n\nNo pending manual payment verification requests.',
      getAdminMainKeyboard()
    );
    return;
  }

  const payment = pendingPayments[0];
  const msg =
    `💳 *Pending Payment Review* (1 of ${pendingPayments.length})\n\n` +
    `Order Number: #${payment.order.orderNumber}\n` +
    `Customer: ${payment.user.username ? '@' + payment.user.username : payment.user.id}\n` +
    `Amount: *Rs. ${Number(payment.amount).toFixed(2)} ${payment.currency}*\n` +
    `Reference: \`${payment.transactionReference || 'None'}\``;

  await safeEditAdminMessage(ctx, msg, getPaymentReviewKeyboard(payment.id));
});

// ✅ Approve Payment
adminComposer.action(/^admin_approve_pay_(.+)$/, async (ctx) => {
  const paymentId = ctx.match[1];
  
  // Instant tactile feedback to Telegram app (stops spinner immediately in < 1ms)
  ctx.answerCbQuery('⏳ Processing approval...').catch(() => {});

  try {
    const result = await AdminService.approvePayment(paymentId, 'Approved by Admin', ctx as any);

    if (result.success) {
      const successText =
        `✅ *Payment Approved & Digital Delivery Dispatched!*\n\n` +
        `• *Order Number:* \`#${result.orderNumber || ''}\`\n` +
        `• *Customer:* ${result.customer || 'Customer'}\n` +
        `• *Amount:* Rs. ${result.amount || ''} PKR\n` +
        `• *Status:* Digital credentials delivered directly to customer chat.`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
      ]);

      await safeEditAdminMessage(ctx, successText, keyboard);
    } else {
      const errorText =
        `⚠️ *Payment Approval Error*\n\n` +
        `• *Order Number:* \`#${result.orderNumber || ''}\`\n` +
        `• *Issue:* ${result.error || 'Could not verify payment'}\n\n` +
        `_If out of stock, please add stock to this product first, then re-approve._`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Retry Approval', `admin_approve_pay_${paymentId}`)],
        [Markup.button.callback('📦 Stock Management', 'admin_stock')],
        [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
      ]);

      await safeEditAdminMessage(ctx, errorText, keyboard);
    }
  } catch (err: any) {
    logger.error('Error in approvePayment handler', { error: err.message });
    const failText = `⚠️ *Approval Error:* ${err.message || 'An unexpected error occurred.'}`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Retry Approval', `admin_approve_pay_${paymentId}`)],
      [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
    ]);
    await safeEditAdminMessage(ctx, failText, keyboard);
  }
});

// ❌ Reject Payment
adminComposer.action(/^admin_reject_pay_(.+)$/, async (ctx) => {
  const paymentId = ctx.match[1];
  
  // Instant tactile feedback to Telegram app (stops spinner immediately in < 1ms)
  ctx.answerCbQuery('⏳ Processing rejection...').catch(() => {});

  try {
    const result = await AdminService.rejectPayment(paymentId, 'Rejected by Admin', ctx as any);

    if (result.success) {
      const rejectedText =
        `❌ *Payment Rejected & Customer Notified*\n\n` +
        `• *Order Number:* \`#${result.orderNumber || ''}\`\n` +
        `• *Customer:* ${result.customer || 'Customer'}\n` +
        `• *Amount:* Rs. ${result.amount || ''} PKR\n` +
        `• *Status:* Payment declined. Notification sent to customer.`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
      ]);

      await safeEditAdminMessage(ctx, rejectedText, keyboard);
    } else {
      const errorText = `⚠️ *Rejection Issue:* ${result.error || 'Could not reject payment.'}`;
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
      ]);
      await safeEditAdminMessage(ctx, errorText, keyboard);
    }
  } catch (err: any) {
    logger.error('Error in rejectPayment handler', { error: err.message });
    const failText = `⚠️ *Rejection Error:* ${err.message || 'An unexpected error occurred.'}`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
    ]);
    await safeEditAdminMessage(ctx, failText, keyboard);
  }
});

// 📦 Stock Management Screen — Shows Products with Stock & Plan breakdown
adminComposer.action('admin_stock', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
    ctx.session.pendingStockLines = undefined;
  }

  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      category: true,
      variants: {
        orderBy: { createdAt: 'asc' },
        include: {
          _count: {
            select: { stockItems: { where: { isSold: false, lockedAt: null } } },
          },
        },
      },
    },
  });

  if (products.length === 0) {
    await safeEditAdminMessage(
      ctx,
      '📦 *Stock Management*\n\nNo products available. Please create a product first!',
      Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]])
    );
    return;
  }

  let totalStoreStock = 0;
  let summaryText = `📦 *Stock & Account Management*\n\n`;

  products.forEach((p) => {
    const pStock = p.variants.reduce((sum, v) => sum + (v._count?.stockItems ?? 0), 0);
    totalStoreStock += pStock;
    summaryText += `• *${p.name}* (${p.variants.length} plans) — *${pStock} accounts*\n`;
  });

  summaryText += `\n📊 *Total Live Inventory:* *${totalStoreStock} items*\n\n`;
  summaryText += `Tap any product below to select a sub-category/plan to upload or delete accounts:`;

  await safeEditAdminMessage(ctx, summaryText, getAdminStockProductsKeyboard(products));
});

// 📦 Stock Management for Specific Product — Sub-Categories & Plans Selection
adminComposer.action(/^admin_stock_prod_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
    ctx.session.pendingStockLines = undefined;
  }
  const prodId = ctx.match[1];
  const product = await prisma.product.findUnique({
    where: { id: prodId },
    include: {
      category: true,
      variants: {
        orderBy: { createdAt: 'asc' },
        include: {
          _count: {
            select: { stockItems: { where: { isSold: false, lockedAt: null } } },
          },
        },
      },
    },
  });

  if (!product) {
    await ctx.answerCbQuery('Product not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const variants = product.variants || [];
  const totalStock = variants.reduce((sum, v) => sum + (v._count?.stockItems ?? 0), 0);

  let plansText = '';
  if (variants.length === 0) {
    plansText = `⚠️ _No sub-categories or plans added yet. Press "➕ Add New Sub-Category / Plan" below._\n`;
  } else {
    plansText = `*Available Sub-Categories / Plans:*\n`;
    variants.forEach((v, idx) => {
      const durationStr = v.duration ? ` [${v.duration}]` : '';
      const deliveryStr = v.deliveryType === 'AUTOMATIC' ? '⚡ Auto' : '🖐 Manual';
      plansText += `${idx + 1}. *${v.name}* — Rs. ${Number(v.price).toFixed(0)} PKR${durationStr}\n   📊 Stock: *${v._count?.stockItems ?? 0} items* | Delivery: ${deliveryStr}\n`;
    });
  }

  const msg =
    `📦 *Stock Management — ${product.name}*\n\n` +
    `• *Category:* ${product.category?.name || 'N/A'}\n` +
    `• *Total Live Stock:* *${totalStock} items*\n\n` +
    `${plansText}\n` +
    `Select a plan below to add stock or delete accounts:`;

  await safeEditAdminMessage(ctx, msg, getAdminStockProductPlansKeyboard(product, variants));
});

// 📥 Select Variant for Stock Upload — Step 1: Ask for Price
adminComposer.action(/^admin_add_stock_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const variantId = ctx.match[1];
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });

  if (!variant) {
    await ctx.answerCbQuery('Sub-category / Plan not found.').catch(() => {});
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_STOCK_PRICE';
  ctx.session.adminData = {
    variantId,
    productName: variant.product.name,
    variantName: variant.name,
    currentPrice: Number(variant.price),
    productId: variant.productId,
  };

  const durationStr = variant.duration ? `• *Warranty / Duration:* ${variant.duration}\n` : '';
  const promptText =
    `💰 *Set Price — ${variant.product.name}*\n\n` +
    `• *Sub-Category / Plan:* *${variant.name}*\n` +
    durationStr +
    `• *Current Price:* *Rs. ${Number(variant.price).toFixed(2)} PKR*\n\n` +
    `Reply with the *new price in PKR* to update it, or type \`skip\` to keep the current price.\n\n` +
    `Example: \`1500\` or \`skip\``;

  await safeEditAdminMessage(
    ctx,
    promptText,
    Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel', `admin_stock_prod_${variant.productId}`)],
    ])
  );
});

// 🗑 Delete Stock — Select Variant
adminComposer.action(/^admin_delete_stock_variant_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const variantId = ctx.match[1];
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: true,
      stockItems: {
        where: { isSold: false, lockedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!variant) {
    await ctx.answerCbQuery('Variant not found.').catch(() => {});
    return;
  }

  if (variant.stockItems.length === 0) {
    await ctx.answerCbQuery('No available stock items to delete.', { show_alert: true }).catch(() => {});
    return;
  }

  const { decryptData } = await import('../../utils/crypto.js');

  const buttons: any[] = variant.stockItems.map((item, i) => [
    Markup.button.callback(
      `🗑 #${i + 1}: ${decryptData(item.content).substring(0, 30)}...`,
      `admin_delete_stock_item_${item.id}`
    ),
  ]);
  buttons.push([Markup.button.callback('⬅️ Back to Stock', 'admin_stock')]);

  await safeEditAdminMessage(
    ctx,
    `🗑 *Delete Stock — ${variant.product.name}*\n\nShowing up to 20 unsold items. Tap one to delete it permanently:`,
    Markup.inlineKeyboard(buttons)
  );
});

// 🗑 Delete Stock Item — Confirm & Execute
adminComposer.action(/^admin_delete_stock_item_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const itemId = ctx.match[1];

  const item = await prisma.stockItem.findUnique({
    where: { id: itemId },
    include: { variant: { include: { product: true } } },
  });

  if (!item) {
    await ctx.answerCbQuery('Stock item not found or already deleted.', { show_alert: true }).catch(() => {});
    return;
  }

  if (item.isSold) {
    await ctx.answerCbQuery('⚠️ Cannot delete a sold stock item.', { show_alert: true }).catch(() => {});
    return;
  }

  await prisma.stockItem.delete({ where: { id: itemId } });

  const remaining = await ProductService.getAvailableStockCount(item.variantId);

  await ctx.answerCbQuery('✅ Stock item deleted successfully.', { show_alert: true }).catch(() => {});
  await safeEditAdminMessage(
    ctx,
    `✅ *Stock item deleted.*\n\n📦 *Product:* ${item.variant.product.name}\n📊 *Remaining Stock:* ${remaining} items`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🗑 Delete More', `admin_delete_stock_variant_${item.variantId}`)],
      [Markup.button.callback('📦 Stock Management', 'admin_stock')],
    ])
  );
});

// 📥 Assign Pending Stock Lines Action
adminComposer.action(/^admin_assign_stock_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const variantId = ctx.match[1];
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });

  if (!variant) {
    await ctx.answerCbQuery('Product variant not found.').catch(() => {});
    return;
  }

  const lines = ctx.session?.pendingStockLines || [];
  if (lines.length === 0) {
    await ctx.answerCbQuery('No pending accounts found to import.', { show_alert: true }).catch(() => {});
    return;
  }

  const result = await AdminService.importBulkStock(variantId, lines);
  ctx.session!.pendingStockLines = undefined;
  ctx.session!.adminState = undefined;
  ctx.session!.adminData = undefined;

  const availableStock = await ProductService.getAvailableStockCount(variantId);

  const summaryMsg =
    `🎉 *Accounts Successfully Uploaded & Encrypted!*\n\n` +
    `📦 *Product:* ${variant.product.name}\n` +
    `✅ *Imported:* ${result.importedCount} accounts\n` +
    `⚠️ *Duplicates Skipped:* ${result.duplicateCount}\n` +
    `📊 *Total Live Stock:* ${availableStock} items available`;

  await safeEditAdminMessage(
    ctx,
    summaryMsg,
    Markup.inlineKeyboard([[Markup.button.callback('📦 Stock Management', 'admin_stock')]])
  );
});

// 📋 Orders Management Screen
adminComposer.action('admin_orders', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }

  const totalOrders = await prisma.order.count();
  const pendingOrders = await prisma.order.count({ where: { orderStatus: 'PENDING' } });
  const completedOrders = await prisma.order.count({ where: { orderStatus: 'COMPLETED' } });

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: true, items: { include: { variant: true } } },
    take: 20,
  });

  const msg =
    `📋 *Order Management*\n\n` +
    `• *Total Orders:* ${totalOrders}\n` +
    `• *Pending Orders:* ${pendingOrders}\n` +
    `• *Completed Orders:* ${completedOrders}\n\n` +
    `Showing latest orders below. Tap any order to view details:`;

  await safeEditAdminMessage(ctx, msg, getAdminOrdersKeyboard(orders, 'ALL'));
});

// 📋 Orders Filter Action (ALL / PENDING / COMPLETED)
adminComposer.action(/^admin_orders_filter_([A-Z]+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const filter = ctx.match[1];

  let whereClause: any = {};
  if (filter === 'PENDING') {
    whereClause = { orderStatus: 'PENDING' };
  } else if (filter === 'COMPLETED') {
    whereClause = { orderStatus: 'COMPLETED' };
  }

  const orders = await prisma.order.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: { user: true, items: { include: { variant: true } } },
    take: 20,
  });

  const totalFiltered = await prisma.order.count({ where: whereClause });

  const msg =
    `📋 *Order Management (${filter})*\n\n` +
    `Showing ${orders.length} of ${totalFiltered} orders with status *${filter}*:\n\n` +
    `Tap any order below to view details:`;

  await safeEditAdminMessage(ctx, msg, getAdminOrdersKeyboard(orders, filter));
});

// 📋 View Single Order Details
adminComposer.action(/^admin_order_view_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const orderId = ctx.match[1];
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      items: { include: { variant: { include: { product: true } } } },
      payments: true,
    },
  });

  if (!order) {
    await ctx.answerCbQuery('Order not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const userDisplay = order.user.username ? `@${order.user.username}` : (order.user.firstName || order.user.telegramId.toString());
  let itemsText = '';
  order.items.forEach((item, i) => {
    itemsText += `${i + 1}. *${item.variant.product.name}* (${item.variant.name}) × ${item.quantity} — Rs. ${Number(item.totalPrice).toFixed(2)}\n`;
  });

  const msg =
    `📋 *Order Details #${order.orderNumber}*\n\n` +
    `• *Customer:* ${userDisplay} (\`${order.user.telegramId.toString()}\`)\n` +
    `• *Order Status:* *${order.orderStatus}*\n` +
    `• *Payment Status:* *${order.paymentStatus}*\n` +
    `• *Delivery Status:* *${order.deliveryStatus}*\n` +
    `• *Total Amount:* *Rs. ${Number(order.totalAmount).toFixed(2)} PKR*\n` +
    (Number(order.discountAmount) > 0 ? `• *Discount Applied:* Rs. ${Number(order.discountAmount).toFixed(2)}\n` : '') +
    `• *Date:* ${new Date(order.createdAt).toLocaleString()}\n\n` +
    `📦 *Purchased Items:*\n${itemsText || '_(None)_'}\n` +
    (order.deliveryData ? `\n🔑 *Delivered Payload:*\n\`${order.deliveryData.substring(0, 80)}...\`\n` : '');

  await safeEditAdminMessage(ctx, msg, getOrderDetailKeyboard(order));
});

// 👥 Users Management Screen
adminComposer.action('admin_users', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }

  const totalUsers = await prisma.user.count();
  const bannedUsers = await prisma.user.count({ where: { isBanned: true } });
  const staffUsers = await prisma.user.count({ where: { role: { in: ['ADMIN', 'OWNER'] } } });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const msg =
    `👥 *Customer & User Management*\n\n` +
    `• *Total Customers:* ${totalUsers}\n` +
    `• *Staff Members:* ${staffUsers}\n` +
    `• *Suspended/Banned Accounts:* ${bannedUsers}\n\n` +
    `Showing latest 20 registered customers. Tap any user to manage:`;

  await safeEditAdminMessage(ctx, msg, getAdminUsersKeyboard(users));
});

// 👥 View Single User Details
adminComposer.action(/^admin_user_view_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }
  const userId = ctx.match[1];
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: { select: { orders: true, payments: true } },
    },
  });

  if (!user) {
    await ctx.answerCbQuery('User not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const userDisplay = user.username ? `@${user.username}` : (user.firstName || user.telegramId.toString());
  const statusStr = user.isBanned ? '🚫 Banned / Suspended' : '✅ Active';

  const msg =
    `👤 *Customer Profile*\n\n` +
    `• *Name/Username:* \`${userDisplay}\`\n` +
    `• *Telegram ID:* \`${user.telegramId.toString()}\`\n` +
    `• *Wallet Balance:* *Rs. ${Number(user.balance).toFixed(2)} PKR*\n` +
    `• *Account Role:* *${user.role}*\n` +
    `• *Status:* ${statusStr}\n` +
    `• *Total Orders Placed:* ${user._count.orders}\n` +
    `• *Total Payments Made:* ${user._count.payments}\n` +
    `• *Joined:* ${new Date(user.createdAt).toLocaleDateString()}\n\n` +
    `Select an action below:`;

  await safeEditAdminMessage(ctx, msg, getUserDetailKeyboard(user));
});

// 🚫 / ✅ Toggle Ban on User
adminComposer.action(/^admin_user_ban_toggle_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.match[1];
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    await ctx.answerCbQuery('User not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isBanned: !user.isBanned },
  });

  UserService.invalidateCache(Number(user.telegramId));
  UserService.invalidateCache(user.id);

  const alertText = updated.isBanned ? '🚫 User has been BANNED.' : '✅ User has been UNBANNED.';
  await ctx.answerCbQuery(alertText, { show_alert: true }).catch(() => {});

  const refreshedUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { _count: { select: { orders: true, payments: true } } },
  });

  if (!refreshedUser) return;

  const userDisplay = refreshedUser.username ? `@${refreshedUser.username}` : (refreshedUser.firstName || refreshedUser.telegramId.toString());
  const statusStr = refreshedUser.isBanned ? '🚫 Banned / Suspended' : '✅ Active';

  const msg =
    `👤 *Customer Profile*\n\n` +
    `• *Name/Username:* \`${userDisplay}\`\n` +
    `• *Telegram ID:* \`${refreshedUser.telegramId.toString()}\`\n` +
    `• *Wallet Balance:* *Rs. ${Number(refreshedUser.balance).toFixed(2)} PKR*\n` +
    `• *Account Role:* *${refreshedUser.role}*\n` +
    `• *Status:* ${statusStr}\n` +
    `• *Total Orders Placed:* ${refreshedUser._count.orders}\n` +
    `• *Total Payments Made:* ${refreshedUser._count.payments}\n` +
    `• *Joined:* ${new Date(refreshedUser.createdAt).toLocaleDateString()}\n\n` +
    `Select an action below:`;

  await safeEditAdminMessage(ctx, msg, getUserDetailKeyboard(refreshedUser));
});

// 💰 Adjust User Balance — Prompt
adminComposer.action(/^admin_user_balance_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.match[1];
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    await ctx.answerCbQuery('User not found.', { show_alert: true }).catch(() => {});
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_USER_BALANCE_ADJUST';
  ctx.session.adminData = { userId, currentBalance: Number(user.balance), username: user.username || user.telegramId.toString() };

  const promptMsg =
    `💰 *Adjust Balance — ${user.username ? '@' + user.username : user.telegramId.toString()}*\n\n` +
    `Current Balance: *Rs. ${Number(user.balance).toFixed(2)} PKR*\n\n` +
    `Reply with the amount to add or set:\n` +
    `• To add funds: \`+500\`\n` +
    `• To deduct funds: \`-200\`\n` +
    `• To set exact balance: \`1000\``;

  await safeEditAdminMessage(
    ctx,
    promptMsg,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', `admin_user_view_${userId}`)]])
  );
});

// 🔍 Search User by Username / ID — Prompt
adminComposer.action('admin_user_search', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_USER_SEARCH_QUERY';

  await safeEditAdminMessage(
    ctx,
    `🔍 *Search Customer / User*\n\nPlease reply with the *Telegram @username* or numeric *Telegram ID*:\n\nExample: \`@zoxer19\` or \`8371873408\``,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_users')]])
  );
});

// 🎟 Coupons Management Screen
adminComposer.action('admin_coupons', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }

  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: 'desc' },
  });

  let text = `🎟 *Discount Coupons Management*\n\nActive Coupons (${coupons.length}):\n`;
  if (coupons.length === 0) text += `_No discount coupons created yet. Press "➕ Create New Coupon" below._\n`;

  await safeEditAdminMessage(ctx, text, getAdminCouponsKeyboard(coupons));
});

// 🎟 View Single Coupon Details
adminComposer.action(/^admin_coupon_view_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const couponId = ctx.match[1];
  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
  });

  if (!coupon) {
    await ctx.answerCbQuery('Coupon not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const statusStr = coupon.isEnabled ? '✅ Enabled (Usable by customers)' : '⏸ Disabled';
  const valStr = coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}% OFF` : `Rs. ${Number(coupon.discountValue).toFixed(2)} PKR OFF`;
  const minOrderStr = coupon.minOrderAmount ? `Rs. ${Number(coupon.minOrderAmount).toFixed(2)} PKR` : 'No minimum';

  const msg =
    `🎟 *Coupon Details — \`${coupon.code}\`*\n\n` +
    `• *Code:* \`${coupon.code}\`\n` +
    `• *Discount:* *${valStr}*\n` +
    `• *Minimum Order:* ${minOrderStr}\n` +
    `• *Total Times Used:* ${coupon.usageCount} times\n` +
    `• *Status:* ${statusStr}\n` +
    `• *Created:* ${new Date(coupon.createdAt).toLocaleDateString()}\n\n` +
    `Select an option below:`;

  await safeEditAdminMessage(ctx, msg, getCouponDetailKeyboard(coupon));
});

// 🔄 Toggle Coupon Status
adminComposer.action(/^admin_coupon_toggle_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const couponId = ctx.match[1];
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!coupon) return;

  const updated = await prisma.coupon.update({
    where: { id: couponId },
    data: { isEnabled: !coupon.isEnabled },
  });

  await ctx.answerCbQuery(updated.isEnabled ? '✅ Coupon Enabled!' : '⏸ Coupon Disabled!').catch(() => {});

  const statusStr = updated.isEnabled ? '✅ Enabled (Usable by customers)' : '⏸ Disabled';
  const valStr = updated.discountType === 'PERCENTAGE' ? `${updated.discountValue}% OFF` : `Rs. ${Number(updated.discountValue).toFixed(2)} PKR OFF`;
  const minOrderStr = updated.minOrderAmount ? `Rs. ${Number(updated.minOrderAmount).toFixed(2)} PKR` : 'No minimum';

  const msg =
    `🎟 *Coupon Details — \`${updated.code}\`*\n\n` +
    `• *Code:* \`${updated.code}\`\n` +
    `• *Discount:* *${valStr}*\n` +
    `• *Minimum Order:* ${minOrderStr}\n` +
    `• *Total Times Used:* ${updated.usageCount} times\n` +
    `• *Status:* ${statusStr}\n` +
    `• *Created:* ${new Date(updated.createdAt).toLocaleDateString()}\n\n` +
    `Select an option below:`;

  await safeEditAdminMessage(ctx, msg, getCouponDetailKeyboard(updated));
});

// 🗑 Confirm Coupon Deletion
adminComposer.action(/^admin_coupon_del_confirm_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const couponId = ctx.match[1];
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!coupon) return;

  const msg =
    `⚠️ *Confirm Coupon Deletion*\n\n` +
    `Are you sure you want to delete coupon *\`${coupon.code}\`*?`;

  await safeEditAdminMessage(ctx, msg, getCouponDeleteConfirmKeyboard(couponId));
});

// 🗑 Execute Coupon Deletion
adminComposer.action(/^admin_coupon_delete_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const couponId = ctx.match[1];
  await prisma.coupon.delete({ where: { id: couponId } }).catch(() => {});

  await ctx.answerCbQuery('🗑 Coupon deleted.', { show_alert: true }).catch(() => {});

  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  let text = `🎟 *Discount Coupons Management*\n\nActive Coupons (${coupons.length}):\n`;
  if (coupons.length === 0) text += `_No discount coupons created yet._\n`;

  await safeEditAdminMessage(ctx, text, getAdminCouponsKeyboard(coupons));
});

// ➕ Add New Coupon Wizard — Step 1: Code
adminComposer.action('admin_coupon_add', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_NEW_COUPON_CODE';
  ctx.session.adminData = {};

  await safeEditAdminMessage(
    ctx,
    `➕ *Create New Coupon (Step 1/3)*\n\nReply with the *Coupon Code* (e.g. \`DISCOUNT20\` or \`WELCOME50\`):`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_coupons')]])
  );
});

// ➕ Add New Coupon — Step 2: Choose Discount Type (Action)
adminComposer.action(/^admin_new_coupon_type_([A-Z]+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const type = ctx.match[1];
  if (!ctx.session?.adminData) ctx.session = { adminData: {} };

  ctx.session.adminData.discountType = type;
  ctx.session.adminState = 'AWAITING_NEW_COUPON_VAL';

  const typeStr = type === 'PERCENTAGE' ? 'Percentage % (e.g. `20` for 20% off)' : 'Fixed PKR Amount (e.g. `500` for Rs. 500 off)';
  await safeEditAdminMessage(
    ctx,
    `➕ *Create New Coupon (Step 3/3)*\n\nCode: *\`${ctx.session.adminData.code}\`*\nDiscount Type: *${type}*\n\nReply with the *Discount Value*:\n${typeStr}`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_coupons')]])
  );
});

// 📢 Broadcast Screen — Prompt Admin for Broadcast Text/Photo
adminComposer.action('admin_broadcast', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userCount = await prisma.user.count({ where: { isBanned: false } });

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_BROADCAST_MESSAGE';

  const msg =
    `📢 *Customer Mass Broadcast*\n\n` +
    `👥 *Total Reachable Customers:* *${userCount} users*\n\n` +
    `Please reply directly to this chat with your *announcement text* or *photo with caption* to send to all registered bot users.\n\n` +
    `_(Supports formatting like *bold*, _italic_, and line breaks)_`;

  await safeEditAdminMessage(
    ctx,
    msg,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_main')]])
  );
});

// 🚀 Confirm & Dispatch Broadcast Action
adminComposer.action('admin_confirm_broadcast', async (ctx) => {
  const adminData = ctx.session?.adminData;
  if (!adminData || (!adminData.broadcastText && !adminData.fileId)) {
    await ctx.answerCbQuery('⚠️ Broadcast message context lost. Please try again.', { show_alert: true }).catch(() => {});
    return;
  }

  const { broadcastText, fileId } = adminData;
  ctx.session!.adminState = undefined;
  ctx.session!.adminData = undefined;

  await ctx.answerCbQuery('🚀 Sending broadcast to all users...').catch(() => {});

  const broadcast = await BroadcastService.sendBroadcast(
    ctx.from.id.toString(),
    broadcastText || '',
    ctx as any,
    fileId
  );

  const confirmMsg =
    `🎉 *Broadcast Dispatched Successfully!*\n\n` +
    `👥 *Target Audience:* ${broadcast.targetCount} customers\n` +
    `⚡ Messages are being delivered in the background.`;

  const keyboard = Markup.inlineKeyboard([[Markup.button.callback('⚙️ Admin Panel', 'admin_main')]]);
  await safeEditAdminMessage(ctx, confirmMsg, keyboard);
});

// ⭐ Reviews Management Screen
adminComposer.action('admin_reviews', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }

  const totalReviews = await prisma.review.count();
  const reviews = await prisma.review.findMany({
    orderBy: { createdAt: 'desc' },
    include: { product: true, user: true },
    take: 20,
  });

  const msg =
    `⭐ *Customer Reviews Moderation*\n\n` +
    `• *Total Product Reviews:* ${totalReviews}\n\n` +
    (reviews.length === 0 ? `_No customer reviews submitted yet._` : `Tap any review below to view and moderate:`);

  await safeEditAdminMessage(ctx, msg, getAdminReviewsKeyboard(reviews));
});

// ⭐ View Single Review Details
adminComposer.action(/^admin_review_view_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const reviewId = ctx.match[1];
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { product: true, user: true, order: true },
  });

  if (!review) {
    await ctx.answerCbQuery('Review not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const userDisplay = review.user.username ? `@${review.user.username}` : (review.user.firstName || review.user.telegramId.toString());
  const stars = '⭐'.repeat(Math.max(1, Math.min(5, review.rating)));

  const msg =
    `⭐ *Review Details*\n\n` +
    `• *Product:* ${review.product?.name || 'Product'}\n` +
    `• *Customer:* ${userDisplay}\n` +
    `• *Order Number:* #${review.order?.orderNumber || 'N/A'}\n` +
    `• *Rating:* ${stars} (${review.rating}/5)\n` +
    `• *Status:* ${review.isApproved ? '✅ Approved & Visible' : '⏸ Hidden'}\n` +
    `• *Comment:*\n"${review.comment || '_(No text comment)_'}"\n\n` +
    `• *Date:* ${new Date(review.createdAt).toLocaleString()}`;

  await safeEditAdminMessage(ctx, msg, getReviewDetailKeyboard(review));
});

// 🔄 Toggle Review Approved Status
adminComposer.action(/^admin_review_toggle_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const reviewId = ctx.match[1];
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) return;

  const updated = await prisma.review.update({
    where: { id: reviewId },
    data: { isApproved: !review.isApproved },
  });

  await ctx.answerCbQuery(updated.isApproved ? '✅ Review Approved!' : '⏸ Review Hidden!').catch(() => {});

  const refreshed = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { product: true, user: true, order: true },
  });
  if (!refreshed) return;

  const userDisplay = refreshed.user.username ? `@${refreshed.user.username}` : (refreshed.user.firstName || refreshed.user.telegramId.toString());
  const stars = '⭐'.repeat(Math.max(1, Math.min(5, refreshed.rating)));

  const msg =
    `⭐ *Review Details*\n\n` +
    `• *Product:* ${refreshed.product?.name || 'Product'}\n` +
    `• *Customer:* ${userDisplay}\n` +
    `• *Order Number:* #${refreshed.order?.orderNumber || 'N/A'}\n` +
    `• *Rating:* ${stars} (${refreshed.rating}/5)\n` +
    `• *Status:* ${refreshed.isApproved ? '✅ Approved & Visible' : '⏸ Hidden'}\n` +
    `• *Comment:*\n"${refreshed.comment || '_(No text comment)_'}"\n\n` +
    `• *Date:* ${new Date(refreshed.createdAt).toLocaleString()}`;

  await safeEditAdminMessage(ctx, msg, getReviewDetailKeyboard(refreshed));
});

// 🗑 Delete Review
adminComposer.action(/^admin_review_delete_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const reviewId = ctx.match[1];
  await prisma.review.delete({ where: { id: reviewId } }).catch(() => {});

  await ctx.answerCbQuery('🗑 Review deleted.', { show_alert: true }).catch(() => {});

  const totalReviews = await prisma.review.count();
  const reviews = await prisma.review.findMany({
    orderBy: { createdAt: 'desc' },
    include: { product: true, user: true },
    take: 20,
  });

  const msg =
    `⭐ *Customer Reviews Moderation*\n\n` +
    `• *Total Product Reviews:* ${totalReviews}\n\n` +
    (reviews.length === 0 ? `_No customer reviews submitted yet._` : `Tap any review below to view and moderate:`);

  await safeEditAdminMessage(ctx, msg, getAdminReviewsKeyboard(reviews));
});

// 🤖 Bot Settings Screen
adminComposer.action('admin_bot_settings', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }
  const me = await ctx.telegram.getMe();
  const shortDescObj = await ctx.telegram.getMyShortDescription().catch(() => ({ short_description: '' }));
  const descObj = await ctx.telegram.getMyDescription().catch(() => ({ description: '' }));

  const currentBio = shortDescObj.short_description || '_(Not set)_';
  const currentDesc = descObj.description
    ? (descObj.description.length > 80 ? descObj.description.substring(0, 80) + '...' : descObj.description)
    : '_(Not set)_';
  const currentSupport = await SettingService.getSupportUsername();
  const supportStr = currentSupport ? `@${currentSupport}` : '_(Not set / Disabled)_';

  const msg =
    `🤖 *Bot Profile & Settings*\n\n` +
    `• *Name:* ${me.first_name}\n` +
    `• *Username:* @${me.username}\n` +
    `• *Bio / About:* ${currentBio}\n` +
    `• *Chat Description:* ${currentDesc}\n` +
    `• *Support Handle:* ${supportStr}\n\n` +
    `Select a setting below to update:`;

  await safeEditAdminMessage(ctx, msg, getBotSettingsKeyboard());
});

// 📛 Change Bot Name — Prompt
adminComposer.action('admin_change_name', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_BOT_NAME';

  await safeEditAdminMessage(
    ctx,
    `📛 *Change Bot Name*\n\nReply with the new display name for the bot (e.g. \`MazariShop 🛒\`).\n\n_Max 64 characters._`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_bot_settings')]])
  );
});

// 📝 Change Bot Description — Prompt
adminComposer.action('admin_change_description', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_BOT_DESCRIPTION';

  await safeEditAdminMessage(
    ctx,
    `📝 *Change Bot Description*\n\nThis text is shown on the empty chat screen when a user opens the bot for the first time.\n\nReply with the new description.\n\n_Max 512 characters._`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_bot_settings')]])
  );
});

// 💬 Change Bot Bio / Short Description — Prompt
adminComposer.action('admin_change_short_desc', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_BOT_SHORT_DESC';

  await safeEditAdminMessage(
    ctx,
    `💬 *Change Bot Bio / About*\n\nThis is the **Bio** shown on your bot's profile page and in search/share previews.\n\nReply with the new bio (or type \`clear\` to remove).\n\n_Max 120 characters._`,
    Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_bot_settings')]])
  );
});

// 🎧 Change Support Handle — Prompt
adminComposer.action('admin_change_support', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_BOT_SUPPORT_USERNAME';

  const currentSupport = await SettingService.getSupportUsername();
  const statusStr = currentSupport ? `✅ *Current Support Handle:* @${currentSupport}` : '❌ *No support handle set*';

  const msg =
    `🎧 *Store Support Handle*\n\n` +
    `${statusStr}\n\n` +
    `Reply with the Telegram username for customer support (e.g. \`@zoxer19\` or \`zoxer19\`).\n\n` +
    `_To remove/delete the support handle, press "Clear Support Handle" below._`;

  await safeEditAdminMessage(
    ctx,
    msg,
    Markup.inlineKeyboard([
      [Markup.button.callback('🗑 Clear Support Handle', 'admin_clear_support')],
      [Markup.button.callback('❌ Cancel', 'admin_bot_settings')],
    ])
  );
});

// 🗑 Clear Support Handle
adminComposer.action('admin_clear_support', async (ctx) => {
  await ctx.answerCbQuery('✅ Support handle removed!', { show_alert: true }).catch(() => {});
  await SettingService.setSetting('support_username', '__NONE__');
  await safeEditAdminMessage(ctx, '✅ *Store Support Handle Removed!*', getBotSettingsKeyboard());
});

// 👤 Change Bot Profile Photo — Info (Telegram API limitation)
adminComposer.action('admin_change_photo', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const me = await ctx.telegram.getMe().catch(() => ({ username: 'your bot' }));
  await safeEditAdminMessage(
    ctx,
    `👤 *Change Bot Profile Avatar Photo*\n\n` +
    `⚠️ *Telegram platform rules require bot profile avatars to be set via BotFather.*\n\n` +
    `*Follow these steps to update your avatar:* \n\n` +
    `1️⃣ Open [@BotFather](https://t.me/BotFather)\n` +
    `2️⃣ Send \`/setuserpic\`\n` +
    `3️⃣ Select your bot (@${me.username})\n` +
    `4️⃣ Upload your new profile picture!`,
    Markup.inlineKeyboard([
      [Markup.button.url('📲 Open @BotFather in Telegram', 'https://t.me/BotFather')],
      [Markup.button.callback('⬅️ Back to Bot Settings', 'admin_bot_settings')],
    ])
  );
});

// 🖼 Change Bot Description/Intro Banner Photo — Info & Direct Guide
adminComposer.action('admin_change_desc_photo', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const me = await ctx.telegram.getMe().catch(() => ({ username: 'your bot' }));
  await safeEditAdminMessage(
    ctx,
    `🖼 *Change Bot Intro / Description Banner Photo*\n\n` +
    `The picture displayed above *"What can this bot do?"* on the initial chat screen is managed directly by Telegram's BotFather.\n\n` +
    `*Follow these quick steps to update it:* \n\n` +
    `1️⃣ Open [@BotFather](https://t.me/BotFather)\n` +
    `2️⃣ Send \`/setdescriptionpic\` (or \`/setdescriptionanimation\` for GIF/video)\n` +
    `3️⃣ Select your bot (@${me.username})\n` +
    `4️⃣ Send/upload your new banner photo!\n\n` +
    `💡 _Note: If you want to change the welcome image sent inside the store menu, use "Change In-Chat Store Banner" in Bot Settings._`,
    Markup.inlineKeyboard([
      [Markup.button.url('📲 Open @BotFather in Telegram', 'https://t.me/BotFather')],
      [Markup.button.callback('⬅️ Back to Bot Settings', 'admin_bot_settings')],
    ])
  );
});

// 🌆 Store Banner Photo — Prompt
adminComposer.action('admin_change_banner', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_BOT_BANNER_PHOTO';

  const currentBannerId = await SettingService.getSetting('banner_photo_file_id');
  const statusStr = currentBannerId ? '✅ *Banner photo is currently set*' : '❌ *No banner photo set*';

  const msg =
    `🌆 *Store Welcome Banner Photo*\n\n` +
    `Status: ${statusStr}\n\n` +
    `Send/upload an image photo to set or replace the Store Banner image shown when customers open the store main menu.\n\n` +
    `_To remove the banner photo, press "Clear Banner" below._`;

  await safeEditAdminMessage(
    ctx,
    msg,
    Markup.inlineKeyboard([
      [Markup.button.callback('🗑 Clear Banner', 'admin_clear_banner')],
      [Markup.button.callback('❌ Cancel', 'admin_bot_settings')],
    ])
  );
});

// 🗑 Clear Store Banner Photo
adminComposer.action('admin_clear_banner', async (ctx) => {
  await ctx.answerCbQuery('✅ Banner photo removed!', { show_alert: true }).catch(() => {});
  await SettingService.deleteSetting('banner_photo_file_id');
  await safeEditAdminMessage(
    ctx,
    '✅ *Store Welcome Banner Photo Removed!*',
    Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Bot Settings', 'admin_bot_settings')]])
  );
});

// 💳 Payment Accounts List
adminComposer.action('admin_payment_accounts', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }
  const accounts = await PaymentAccountService.getAllAccounts();

  const msg =
    `💳 *Payment Accounts Management*\n\n` +
    `Configure manual transfer accounts (JazzCash, EasyPaisa, Bank accounts, etc.) shown to customers at checkout.\n\n` +
    `Active accounts count: *${accounts.filter((a) => a.isEnabled).length}*`;

  await safeEditAdminMessage(ctx, msg, getPaymentAccountsKeyboard(accounts));
});

// 💳 View Single Payment Account
adminComposer.action(/^admin_payacc_view_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const accountId = ctx.match[1];
  const account = await PaymentAccountService.getAccountById(accountId);

  if (!account) {
    await ctx.answerCbQuery('Payment account not found.').catch(() => {});
    return;
  }

  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }

  const msg =
    `💳 *Payment Account Details*\n\n` +
    `• *Provider:* ${account.providerName}\n` +
    `• *Account Number / IBAN:* \`${account.accountNumber}\`\n` +
    `• *Account Title:* *${account.accountTitle}*\n` +
    `• *Status:* ${account.isEnabled ? '✅ Enabled (Visible at checkout)' : '⏸ Disabled (Hidden)'}\n` +
    `• *Instructions:* ${account.instructions || '_(Default checkout instructions)_'}`;

  await safeEditAdminMessage(ctx, msg, getPaymentAccountDetailKeyboard(account));
});

// ✏️ Edit Account Number
adminComposer.action(/^admin_payacc_edit_num_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const accountId = ctx.match[1];
  const account = await PaymentAccountService.getAccountById(accountId);
  if (!account) return;

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_PAYACC_NUMBER';
  ctx.session.adminData = { accountId };

  await safeEditAdminMessage(
    ctx,
    `✏️ *Edit Account Number — ${account.providerName}*\n\nCurrent: \`${account.accountNumber}\`\n\nReply with the new account number / IBAN:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel', `admin_payacc_view_${accountId}`)],
    ])
  );
});

// 🏷 Edit Account Title
adminComposer.action(/^admin_payacc_edit_title_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const accountId = ctx.match[1];
  const account = await PaymentAccountService.getAccountById(accountId);
  if (!account) return;

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_PAYACC_TITLE';
  ctx.session.adminData = { accountId };

  await safeEditAdminMessage(
    ctx,
    `🏷 *Edit Account Title — ${account.providerName}*\n\nCurrent: *${account.accountTitle}*\n\nReply with the new account holder title / name:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel', `admin_payacc_view_${accountId}`)],
    ])
  );
});

// 📝 Edit Account Instructions
adminComposer.action(/^admin_payacc_edit_instr_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const accountId = ctx.match[1];
  const account = await PaymentAccountService.getAccountById(accountId);
  if (!account) return;

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_PAYACC_INSTRUCTIONS';
  ctx.session.adminData = { accountId };

  await safeEditAdminMessage(
    ctx,
    `📝 *Edit Instructions — ${account.providerName}*\n\nCurrent:\n${account.instructions || '_(None)_'}\n\nReply with the new instructions, or send \`clear\` to reset:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel', `admin_payacc_view_${accountId}`)],
    ])
  );
});

// 🔄 Toggle Account Status
adminComposer.action(/^admin_payacc_toggle_(.+)$/, async (ctx) => {
  const accountId = ctx.match[1];
  const updated = await PaymentAccountService.toggleAccount(accountId);

  await ctx.answerCbQuery(
    updated.isEnabled ? '✅ Account enabled for checkout' : '⏸ Account disabled'
  ).catch(() => {});

  const msg =
    `💳 *Payment Account Details*\n\n` +
    `• *Provider:* ${updated.providerName}\n` +
    `• *Account Number / IBAN:* \`${updated.accountNumber}\`\n` +
    `• *Account Title:* *${updated.accountTitle}*\n` +
    `• *Status:* ${updated.isEnabled ? '✅ Enabled (Visible at checkout)' : '⏸ Disabled (Hidden)'}\n` +
    `• *Instructions:* ${updated.instructions || '_(Default checkout instructions)_'}`;

  await safeEditAdminMessage(ctx, msg, getPaymentAccountDetailKeyboard(updated));
});

// 🗑 Delete Account
adminComposer.action(/^admin_payacc_delete_(.+)$/, async (ctx) => {
  const accountId = ctx.match[1];
  await PaymentAccountService.deleteAccount(accountId);
  await ctx.answerCbQuery('🗑 Account deleted successfully.').catch(() => {});

  const accounts = await PaymentAccountService.getAllAccounts();
  const msg =
    `💳 *Payment Accounts Management*\n\n` +
    `Account was deleted.\n\n` +
    `Configure manual transfer accounts shown to customers at checkout.\n` +
    `Active accounts: *${accounts.filter((a) => a.isEnabled).length}*`;

  await safeEditAdminMessage(ctx, msg, getPaymentAccountsKeyboard(accounts));
});

// ➕ Add New Payment Account Wizard — Step 1: Provider Name
adminComposer.action('admin_payacc_add', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_NEW_PAYACC_PROVIDER';
  ctx.session.adminData = {};

  await safeEditAdminMessage(
    ctx,
    `➕ *Add Payment Account (Step 1/4)*\n\nReply with the *Provider / Bank Name* (e.g. \`JazzCash\`, \`EasyPaisa\`, \`Meezan Bank\`, \`SadaPay\`, \`Nayapay\`, \`Binance USDT\`):`,
    Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel', 'admin_payment_accounts')],
    ])
  );
});

// 🛡 Staff & Roles Management Screen
adminComposer.action('admin_roles', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }

  const staffUsers = await UserService.getAllStaffUsers();

  const msg =
    `🛡 *Staff & Roles Management*\n\n` +
    `Manage bot administrators and owners.\n\n` +
    `👑 *Owner:* Full access to bot, role assignments, and all admin tools.\n` +
    `🛡 *Admin:* Access to products, stock, orders, payments, broadcasts.\n\n` +
    `Current Staff Members (${staffUsers.length}):`;

  await safeEditAdminMessage(ctx, msg, getRolesManagementKeyboard(staffUsers));
});

// 📋 View Full Staff List (Owners, Admins, Pending Pre-Authorizations)
adminComposer.action('admin_roles_list', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const staffUsers = await UserService.getAllStaffUsers();
  const preAuthUsers = await UserService.getAllPreAuthorizedStaff();

  let msg = `📋 *Full Staff & Administration List*\n\n`;

  const owners = staffUsers.filter((u) => u.role === 'OWNER');
  const admins = staffUsers.filter((u) => u.role === 'ADMIN');

  msg += `👑 *OWNERS (${owners.length}):*\n`;
  if (owners.length === 0) {
    msg += `_None_\n`;
  } else {
    owners.forEach((u, i) => {
      const userStr = u.username ? `@${u.username}` : (u.firstName || 'User');
      msg += `${i + 1}. \`${userStr}\` \`(ID: ${u.telegramId.toString()})\` — Joined ${new Date(u.createdAt).toLocaleDateString()}\n`;
    });
  }

  msg += `\n🛡 *ADMINISTRATORS (${admins.length}):*\n`;
  if (admins.length === 0) {
    msg += `_None_\n`;
  } else {
    admins.forEach((u, i) => {
      const userStr = u.username ? `@${u.username}` : (u.firstName || 'User');
      msg += `${i + 1}. \`${userStr}\` \`(ID: ${u.telegramId.toString()})\` — Joined ${new Date(u.createdAt).toLocaleDateString()}\n`;
    });
  }

  if (preAuthUsers.length > 0) {
    msg += `\n⏳ *PENDING PRE-AUTHORIZATIONS (${preAuthUsers.length}):*\n`;
    preAuthUsers.forEach((p, i) => {
      const queryStr = /^\d+$/.test(p.query) ? p.query : `@${p.query}`;
      msg += `${i + 1}. \`${queryStr}\` → Role: *${p.role}*\n`;
    });
  }

  await safeEditAdminMessage(
    ctx,
    msg,
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Add / Change User Role', 'admin_roles_add')],
      [Markup.button.callback('🛡 Staff Management', 'admin_roles')],
      [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
    ])
  );
});

// 🛡 View Single Staff Member / Role Assignment
adminComposer.action(/^admin_roles_view_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.match[1];
  const user = await UserService.getUserById(userId);

  if (!user) {
    await ctx.answerCbQuery('User not found.').catch(() => {});
    return;
  }

  const userDisplay = user.username ? `@${user.username}` : (user.firstName || user.id);
  const msg =
    `👤 *Staff Member Profile*\n\n` +
    `• *Name/Handle:* \`${userDisplay}\`\n` +
    `• *Telegram ID:* \`${user.telegramId.toString()}\`\n` +
    `• *Current Role:* *${user.role}*\n` +
    `• *Joined:* ${new Date(user.createdAt).toLocaleDateString()}\n\n` +
    `Select a role below to assign:`;

  await safeEditAdminMessage(ctx, msg, getRoleAssignmentKeyboard(user.id));
});

// ➕ Add / Change User Role — Prompt
adminComposer.action('admin_roles_add', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_USER_LOOKUP_FOR_ROLE';

  await safeEditAdminMessage(
    ctx,
    `➕ *Assign Staff Role*\n\nPlease reply with the *Telegram @username* or numeric *Telegram ID* of the user you wish to promote or manage:\n\nExample: \`@username\` or \`123456789\``,
    Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel', 'admin_roles')],
    ])
  );
});

// 👑 / 🛡 / 👤 Role Assignment Execution Action
adminComposer.action(/^admin_roles_set_([A-Z]+)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const targetRole = ctx.match[1] as Role;
  const targetUserId = ctx.match[2];

  if (!['OWNER', 'ADMIN', 'USER'].includes(targetRole)) {
    await ctx.answerCbQuery('Invalid role specified.').catch(() => {});
    return;
  }

  try {
    const updated = await UserService.setUserRole(targetUserId, targetRole);
    const userDisplay = updated.username ? `@${updated.username}` : (updated.firstName || updated.id);

    await ctx.answerCbQuery(`✅ Role set to ${targetRole}!`, { show_alert: true }).catch(() => {});

    const msg =
      `✅ *Role Updated Successfully!*\n\n` +
      `• *User:* ${userDisplay} (\`${updated.telegramId.toString()}\`)\n` +
      `• *New Role:* *${updated.role}*`;

    await safeEditAdminMessage(
      ctx,
      msg,
      Markup.inlineKeyboard([
        [Markup.button.callback('🛡 Staff & Roles', 'admin_roles')],
        [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
      ])
    );
  } catch (err: any) {
    logger.error('Failed to set user role', { error: err.message });
    await ctx.answerCbQuery(`⚠️ Error: ${err.message}`, { show_alert: true }).catch(() => {});
  }
});

// 📥 Pre-Auth Role Assignment — for users who haven't started the bot yet
adminComposer.action(/^admin_preauth_([A-Z]+)_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const targetRole = ctx.match[1] as Role;
  const encodedQuery = ctx.match[2];

  if (!['OWNER', 'ADMIN'].includes(targetRole)) {
    await ctx.answerCbQuery('Invalid role specified.').catch(() => {});
    return;
  }

  let rawQuery: string;
  try {
    rawQuery = Buffer.from(encodedQuery, 'hex').toString('utf8');
    if (!rawQuery) throw new Error('empty');
  } catch {
    await ctx.answerCbQuery('⚠️ Invalid data. Please try again.', { show_alert: true }).catch(() => {});
    return;
  }

  try {
    const adminId = ctx.dbUser?.id;
    await UserService.preAuthorizeStaff(rawQuery, targetRole, adminId);
    const displayQuery = /^\d+$/.test(rawQuery) ? rawQuery : `@${rawQuery}`;

    await ctx.answerCbQuery(`✅ Pre-authorized as ${targetRole}!`, { show_alert: true }).catch(() => {});

    const msg =
      `✅ *Pre-Authorization Saved!*\n\n` +
      `• *User:* \`${rawQuery}\`\n` +
      `• *Role:* *${targetRole}*\n\n` +
      `When this user sends /start to the bot, they will automatically receive the *${targetRole}* role.`;

    await safeEditAdminMessage(
      ctx,
      msg,
      Markup.inlineKeyboard([
        [Markup.button.callback('🛡 Staff & Roles', 'admin_roles')],
        [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
      ])
    );
  } catch (err: any) {
    logger.error('Failed to pre-authorize staff', { error: err.message });
    await ctx.answerCbQuery(`⚠️ Error: ${err.message}`, { show_alert: true }).catch(() => {});
  }
});

// 📩 Message Listener (Text & Photo) for Admin Input Wizard & Broadcasts
adminComposer.on(['text', 'photo'], async (ctx, next) => {
  // If the message is a command (e.g. /start, /admin, /cancel, /stop, /shop), clear any stale wizard state and pass immediately to the command handler
  if (ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/')) {
    if (ctx.session) {
      ctx.session.adminState = undefined;
      ctx.session.adminData = undefined;
      ctx.session.pendingStockLines = undefined;
    }
    return next();
  }

  const state = ctx.session?.adminState;
  if (!state) {
    return next();
  }

  const adminData = ctx.session?.adminData || {};
  
  let text = '';
  let fileId: string | undefined = undefined;

  if (ctx.message && 'text' in ctx.message) {
    text = ctx.message.text.trim();
  } else if (ctx.message && 'photo' in ctx.message && ctx.message.photo.length > 0) {
    const highestRes = ctx.message.photo[ctx.message.photo.length - 1];
    fileId = highestRes.file_id;
    if (ctx.message.caption) {
      text = ctx.message.caption.trim();
    }
  }

  // 🤖 Bot Settings Wizard — Change Bot Name
  if (state === 'AWAITING_BOT_NAME') {
    if (!text || text.length > 64) {
      await ctx.reply('⚠️ Bot name must be between 1 and 64 characters. Please try again.');
      return;
    }
    try {
      await ctx.telegram.setMyName(text);
      ctx.session!.adminState = undefined;
      await ctx.reply(`✅ *Bot name updated to:* ${text}`, {
        parse_mode: 'Markdown',
        reply_markup: getBotSettingsKeyboard().reply_markup,
      });
    } catch (err: any) {
      logger.error('Failed to set bot name', { error: err.message });
      await ctx.reply(`⚠️ Failed to update bot name: ${err.message}`);
    }
    return;
  }

  // 🤖 Bot Settings Wizard — Change Bot Description
  if (state === 'AWAITING_BOT_DESCRIPTION') {
    if (text.length > 512) {
      await ctx.reply('⚠️ Description must be 512 characters or fewer. Please shorten it and try again.');
      return;
    }
    try {
      await ctx.telegram.setMyDescription(text);
      ctx.session!.adminState = undefined;
      await ctx.reply(`✅ *Bot description updated successfully!*`, {
        parse_mode: 'Markdown',
        reply_markup: getBotSettingsKeyboard().reply_markup,
      });
    } catch (err: any) {
      logger.error('Failed to set bot description', { error: err.message });
      await ctx.reply(`⚠️ Failed to update bot description: ${err.message}`);
    }
    return;
  }

  // 🤖 Bot Settings Wizard — Change Bot Bio / Short Description
  if (state === 'AWAITING_BOT_SHORT_DESC') {
    if (text.length > 120) {
      await ctx.reply('⚠️ Bio must be 120 characters or fewer. Please shorten it and try again.');
      return;
    }
    const newBio = text.toLowerCase() === 'clear' ? '' : text;
    try {
      await ctx.telegram.setMyShortDescription(newBio);
      ctx.session!.adminState = undefined;
      const successText = newBio
        ? `✅ *Bot Bio updated to:*\n"${newBio}"`
        : `✅ *Bot Bio cleared successfully!*`;

      await ctx.reply(successText, {
        parse_mode: 'Markdown',
        reply_markup: getBotSettingsKeyboard().reply_markup,
      });
    } catch (err: any) {
      logger.error('Failed to set bot bio', { error: err.message });
      await ctx.reply(`⚠️ Failed to update bot bio: ${err.message}`);
    }
    return;
  }

  // 🎧 Bot Settings Wizard — Change Support Handle
  if (state === 'AWAITING_BOT_SUPPORT_USERNAME') {
    const cleanUsername = text.trim().replace(/^@/, '');
    if (!cleanUsername || cleanUsername.length < 3) {
      await ctx.reply('⚠️ Please send a valid Telegram username (e.g. `@zoxer19`).');
      return;
    }
    try {
      await SettingService.setSetting('support_username', cleanUsername);
      ctx.session!.adminState = undefined;
      await ctx.reply(`✅ *Support handle updated to:* @${cleanUsername}`, {
        parse_mode: 'Markdown',
        reply_markup: getBotSettingsKeyboard().reply_markup,
      });
    } catch (err: any) {
      logger.error('Failed to set support handle', { error: err.message });
      await ctx.reply(`⚠️ Failed to update support handle: ${err.message}`);
    }
    return;
  }

  // 🤖 Bot Settings Wizard — Change Store Banner Photo
  if (state === 'AWAITING_BOT_BANNER_PHOTO') {
    if (!fileId) {
      await ctx.reply('⚠️ Please upload an image photo to set as the store banner.');
      return;
    }
    try {
      await SettingService.setSetting('banner_photo_file_id', fileId);
      ctx.session!.adminState = undefined;
      await ctx.reply(`✅ *Store Welcome Banner Photo updated successfully!*`, {
        parse_mode: 'Markdown',
        reply_markup: getBotSettingsKeyboard().reply_markup,
      });
    } catch (err: any) {
      logger.error('Failed to set bot banner photo', { error: err.message });
      await ctx.reply(`⚠️ Failed to update banner photo: ${err.message}`);
    }
    return;
  }

  // 💳 Edit Payment Account Number
  if (state === 'AWAITING_PAYACC_NUMBER' && adminData.accountId) {
    if (!text) {
      await ctx.reply('⚠️ Please send a valid account number.');
      return;
    }
    const updated = await PaymentAccountService.updateAccount(adminData.accountId, { accountNumber: text });
    ctx.session!.adminState = undefined;
    ctx.session!.adminData = undefined;

    await ctx.reply(`✅ *Account number updated to:* \`${text}\``, {
      parse_mode: 'Markdown',
      reply_markup: getPaymentAccountDetailKeyboard(updated).reply_markup,
    });
    return;
  }

  // 💳 Edit Payment Account Title
  if (state === 'AWAITING_PAYACC_TITLE' && adminData.accountId) {
    if (!text) {
      await ctx.reply('⚠️ Please send a valid account title.');
      return;
    }
    const updated = await PaymentAccountService.updateAccount(adminData.accountId, { accountTitle: text });
    ctx.session!.adminState = undefined;
    ctx.session!.adminData = undefined;

    await ctx.reply(`✅ *Account title updated to:* *${text}*`, {
      parse_mode: 'Markdown',
      reply_markup: getPaymentAccountDetailKeyboard(updated).reply_markup,
    });
    return;
  }

  // 💳 Edit Payment Account Instructions
  if (state === 'AWAITING_PAYACC_INSTRUCTIONS' && adminData.accountId) {
    const instr = text.toLowerCase() === 'clear' ? null : text;
    const updated = await PaymentAccountService.updateAccount(adminData.accountId, { instructions: instr });
    ctx.session!.adminState = undefined;
    ctx.session!.adminData = undefined;

    await ctx.reply(`✅ *Instructions updated successfully!*`, {
      parse_mode: 'Markdown',
      reply_markup: getPaymentAccountDetailKeyboard(updated).reply_markup,
    });
    return;
  }

  // 💳 Add Payment Account — Step 1 -> Step 2 (Number)
  if (state === 'AWAITING_NEW_PAYACC_PROVIDER') {
    if (!text) {
      await ctx.reply('⚠️ Please enter a provider name (e.g. `JazzCash`).');
      return;
    }
    adminData.providerName = text;
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_NEW_PAYACC_NUMBER';

    await ctx.reply(
      `✅ Provider: *${text}*\n\n*(Step 2/4)* Now reply with the *Account Number / IBAN*:`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // 💳 Add Payment Account — Step 2 -> Step 3 (Title)
  if (state === 'AWAITING_NEW_PAYACC_NUMBER') {
    if (!text) {
      await ctx.reply('⚠️ Please enter an account number.');
      return;
    }
    adminData.accountNumber = text;
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_NEW_PAYACC_TITLE';

    await ctx.reply(
      `✅ Account Number: \`${text}\`\n\n*(Step 3/4)* Now reply with the *Account Title / Account Holder Name*:`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // 💳 Add Payment Account — Step 3 -> Step 4 (Instructions)
  if (state === 'AWAITING_NEW_PAYACC_TITLE') {
    if (!text) {
      await ctx.reply('⚠️ Please enter an account title.');
      return;
    }
    adminData.accountTitle = text;
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_NEW_PAYACC_INSTRUCTIONS';

    await ctx.reply(
      `✅ Account Title: *${text}*\n\n*(Final Step)* Reply with *Transfer Instructions* for the customer, or type \`skip\` to use defaults:`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // 💳 Add Payment Account — Step 4 -> Create Account
  if (state === 'AWAITING_NEW_PAYACC_INSTRUCTIONS') {
    const instructions = text.toLowerCase() === 'skip' ? undefined : text;
    const { providerName, accountNumber, accountTitle } = adminData;

    const created = await PaymentAccountService.createAccount({
      providerName,
      accountNumber,
      accountTitle,
      instructions,
    });

    ctx.session!.adminState = undefined;
    ctx.session!.adminData = undefined;

    const accounts = await PaymentAccountService.getAllAccounts();

    await ctx.reply(
      `🎉 *Payment Account Added Successfully!*\n\n` +
        `• *Provider:* ${created.providerName}\n` +
        `• *Account Number:* \`${created.accountNumber}\`\n` +
        `• *Title:* *${created.accountTitle}*\n` +
        `• *Status:* ✅ Active`,
      {
        parse_mode: 'Markdown',
        reply_markup: getPaymentAccountsKeyboard(accounts).reply_markup,
      }
    );
    return;
  }

  // 🛡 Staff & Roles — User Lookup
  if (state === 'AWAITING_USER_LOOKUP_FOR_ROLE') {
    if (!text) {
      await ctx.reply('⚠️ Please reply with a valid @username or numeric Telegram ID.');
      return;
    }

    const foundUser = await UserService.findUserByUsernameOrId(text);
    if (!foundUser) {
      // User not in DB yet — offer to pre-authorize them
      const cleanQuery = text.trim().replace(/^@/, '');
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;

      await ctx.reply(
        `💡 *User \`${text}\` is not in the bot database yet.*\n\n` +
        `This means they have not sent /start to the bot.\n\n` +
        `You can **pre-authorize** them now. When they send /start, the role will be applied automatically.\n\n` +
        `Choose a role to pre-assign:`,
        {
          parse_mode: 'Markdown',
          reply_markup: getPreAuthRoleKeyboard(cleanQuery).reply_markup,
        }
      );
      return;
    }

    ctx.session!.adminState = undefined;
    ctx.session!.adminData = undefined;

    const userDisplay = foundUser.username ? `@${foundUser.username}` : (foundUser.firstName || foundUser.id);
    const lookupMsg =
      `👤 *User Found: ${userDisplay}*\n\n` +
      `• *Telegram ID:* \`${foundUser.telegramId.toString()}\`\n` +
      `• *Current Role:* *${foundUser.role}*\n` +
      `• *Balance:* Rs. ${Number(foundUser.balance).toFixed(2)}\n\n` +
      `Select a new role to assign:`;

    await ctx.reply(lookupMsg, {
      parse_mode: 'Markdown',
      reply_markup: getRoleAssignmentKeyboard(foundUser.id).reply_markup,
    });
    return;
  }

  // 🔍 User Management — Search User Query
  if (state === 'AWAITING_USER_SEARCH_QUERY') {
    if (!text) {
      await ctx.reply('⚠️ Please reply with a valid @username or numeric Telegram ID.');
      return;
    }

    const foundUser = await UserService.findUserByUsernameOrId(text);
    if (!foundUser) {
      await ctx.reply(
        `⚠️ No customer found with \`${text}\`.\n\nPlease check the username or Telegram ID and try again, or click Cancel:`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_users')]]).reply_markup,
        }
      );
      return;
    }

    ctx.session!.adminState = undefined;
    ctx.session!.adminData = undefined;

    const fullUser = await prisma.user.findUnique({
      where: { id: foundUser.id },
      include: { _count: { select: { orders: true, payments: true } } },
    });

    if (!fullUser) {
      await ctx.reply('⚠️ Customer not found.');
      return;
    }

    const userDisplay = fullUser.username ? `@${fullUser.username}` : (fullUser.firstName || fullUser.telegramId.toString());
    const statusStr = fullUser.isBanned ? '🚫 Banned / Suspended' : '✅ Active';

    const msg =
      `👤 *Customer Profile*\n\n` +
      `• *Name/Username:* \`${userDisplay}\`\n` +
      `• *Telegram ID:* \`${fullUser.telegramId.toString()}\`\n` +
      `• *Wallet Balance:* *Rs. ${Number(fullUser.balance).toFixed(2)} PKR*\n` +
      `• *Account Role:* *${fullUser.role}*\n` +
      `• *Status:* ${statusStr}\n` +
      `• *Total Orders Placed:* ${fullUser._count.orders}\n` +
      `• *Total Payments Made:* ${fullUser._count.payments}\n` +
      `• *Joined:* ${new Date(fullUser.createdAt).toLocaleDateString()}\n\n` +
      `Select an action below:`;

    await ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: getUserDetailKeyboard(fullUser).reply_markup,
    });
    return;
  }

  // 💰 User Management — Adjust Balance
  if (state === 'AWAITING_USER_BALANCE_ADJUST' && adminData.userId) {
    const { userId, currentBalance } = adminData;
    const cleanText = text.trim();

    let targetBalance: number;
    let delta = 0;

    if (cleanText.startsWith('+')) {
      const val = parseFloat(cleanText.replace('+', '').trim());
      if (isNaN(val) || val <= 0) {
        await ctx.reply('⚠️ Invalid amount. Example to add funds: `+500`', { parse_mode: 'Markdown' });
        return;
      }
      delta = val;
      targetBalance = currentBalance + delta;
    } else if (cleanText.startsWith('-')) {
      const val = parseFloat(cleanText.replace('-', '').trim());
      if (isNaN(val) || val <= 0) {
        await ctx.reply('⚠️ Invalid amount. Example to deduct funds: `-200`', { parse_mode: 'Markdown' });
        return;
      }
      delta = -val;
      targetBalance = Math.max(0, currentBalance + delta);
    } else {
      const val = parseFloat(cleanText);
      if (isNaN(val) || val < 0) {
        await ctx.reply('⚠️ Invalid balance. Enter a non-negative number (e.g. `1000` or `+500`):', { parse_mode: 'Markdown' });
        return;
      }
      targetBalance = val;
      delta = targetBalance - currentBalance;
    }

    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { balance: targetBalance },
        include: { _count: { select: { orders: true, payments: true } } },
      });

      if (delta !== 0) {
        await prisma.walletTransaction.create({
          data: {
            userId,
            amount: Math.abs(delta),
            type: delta > 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
            balanceAfter: targetBalance,
            description: `Admin balance adjustment (${delta > 0 ? '+' : ''}${delta.toFixed(2)} PKR)`,
          },
        });
      }

      UserService.invalidateCache(Number(updatedUser.telegramId));
      UserService.invalidateCache(updatedUser.id);

      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;

      const userDisplay = updatedUser.username ? `@${updatedUser.username}` : (updatedUser.firstName || updatedUser.telegramId.toString());

      await ctx.reply(
        `🎉 *Balance updated successfully!*\n\n` +
        `👤 *Customer:* \`${userDisplay}\`\n` +
        `💰 *New Balance:* *Rs. ${Number(updatedUser.balance).toFixed(2)} PKR* (${delta >= 0 ? '+' : ''}${delta.toFixed(2)} PKR)`,
        {
          parse_mode: 'Markdown',
          reply_markup: getUserDetailKeyboard(updatedUser).reply_markup,
        }
      );
    } catch (err: any) {
      logger.error('Failed to adjust user balance', { error: err.message, userId });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;
      await ctx.reply(`⚠️ Failed to adjust balance: ${err.message}`);
    }
    return;
  }

  // 🎟 Coupon Creation Wizard — Step 1: Code -> Step 2: Discount Type
  if (state === 'AWAITING_NEW_COUPON_CODE') {
    const code = text.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code || code.length < 2 || code.length > 30) {
      await ctx.reply('⚠️ Coupon code must be between 2 and 30 alphanumeric characters (e.g. `DISCOUNT20` or `WELCOME50`):');
      return;
    }

    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      await ctx.reply(`⚠️ Coupon code *\`${code}\`* already exists. Please choose a different code:`, { parse_mode: 'Markdown' });
      return;
    }

    if (!ctx.session) ctx.session = {};
    ctx.session.adminData = { code };
    ctx.session.adminState = 'AWAITING_NEW_COUPON_TYPE';

    const typeKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Percentage (%) Off', 'admin_new_coupon_type_PERCENTAGE'),
        Markup.button.callback('💵 Fixed PKR Amount Off', 'admin_new_coupon_type_FIXED'),
      ],
      [Markup.button.callback('❌ Cancel', 'admin_coupons')],
    ]);

    await ctx.reply(
      `✅ Coupon Code: *\`${code}\`*\n\n*(Step 2/3)* Choose the *Discount Type*:`,
      {
        parse_mode: 'Markdown',
        reply_markup: typeKeyboard.reply_markup,
      }
    );
    return;
  }

  // 🎟 Coupon Creation Wizard — Step 3: Value -> Step 4: Min Order Amount
  if (state === 'AWAITING_NEW_COUPON_VAL' && adminData.code && adminData.discountType) {
    const cleanVal = text.replace(/,/g, '').replace(/[^0-9.]/g, '');
    const numVal = parseFloat(cleanVal);

    if (isNaN(numVal) || numVal <= 0) {
      await ctx.reply('⚠️ Please enter a valid positive number for the discount value (e.g. `20` or `500`):');
      return;
    }

    if (adminData.discountType === 'PERCENTAGE' && (numVal < 1 || numVal > 100)) {
      await ctx.reply('⚠️ Percentage discount must be between 1% and 100%. Please try again:');
      return;
    }

    adminData.discountValue = numVal;
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_NEW_COUPON_MIN';

    const valDisplay = adminData.discountType === 'PERCENTAGE' ? `${numVal}% OFF` : `Rs. ${numVal.toFixed(2)} PKR OFF`;
    await ctx.reply(
      `✅ Discount Value: *${valDisplay}*\n\n*(Final Step)* Reply with the *Minimum Order Amount in PKR* to use this coupon (e.g. \`1000\`), or type \`skip\` for no minimum requirement:`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_coupons')]]).reply_markup,
      }
    );
    return;
  }

  // 🎟 Coupon Creation Wizard — Step 4: Min Order -> Create Coupon in Database!
  if (state === 'AWAITING_NEW_COUPON_MIN' && adminData.code && adminData.discountType && adminData.discountValue) {
    let minOrderAmount: number | null = null;
    if (text.toLowerCase() !== 'skip') {
      const cleanMin = text.replace(/,/g, '').replace(/[^0-9.]/g, '');
      const parsedMin = parseFloat(cleanMin);
      if (isNaN(parsedMin) || parsedMin < 0) {
        await ctx.reply('⚠️ Invalid amount. Please enter a valid number (e.g. `1000`) or type `skip`:');
        return;
      }
      minOrderAmount = parsedMin;
    }

    const { code, discountType, discountValue } = adminData;

    try {
      const created = await prisma.coupon.create({
        data: {
          code,
          discountType: discountType as any,
          discountValue,
          minOrderAmount,
          isEnabled: true,
        },
      });

      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;

      const valStr = created.discountType === 'PERCENTAGE' ? `${created.discountValue}% OFF` : `Rs. ${Number(created.discountValue).toFixed(2)} PKR OFF`;
      const minStr = created.minOrderAmount ? `Rs. ${Number(created.minOrderAmount).toFixed(2)} PKR` : 'No minimum';

      await ctx.reply(
        `🎉 *Discount Coupon Created Successfully!*\n\n` +
        `• *Code:* \`${created.code}\`\n` +
        `• *Discount:* *${valStr}*\n` +
        `• *Minimum Order:* ${minStr}\n` +
        `• *Status:* ✅ Enabled & Active`,
        {
          parse_mode: 'Markdown',
          reply_markup: getCouponDetailKeyboard(created).reply_markup,
        }
      );
    } catch (err: any) {
      logger.error('Failed to create coupon', { error: err.message, adminData });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;
      await ctx.reply(`⚠️ Failed to create coupon: ${err.message}`, {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Coupons', 'admin_coupons')]]).reply_markup,
      });
    }
    return;
  }

  // 📢 Broadcast Wizard — Broadcast Message Input State
  if (state === 'AWAITING_BROADCAST_MESSAGE') {
    if (!text && !fileId) {
      await ctx.reply('⚠️ Please reply with a valid announcement text or a photo with caption.');
      return;
    }

    const userCount = await prisma.user.count({ where: { isBanned: false } });

    if (!ctx.session) ctx.session = {};
    ctx.session.adminState = 'CONFIRM_BROADCAST';
    ctx.session.adminData = { broadcastText: text, fileId };

    const previewText =
      `📢 *Broadcast Preview & Confirmation*\n\n` +
      `👥 *Target Audience:* ${userCount} registered customers\n\n` +
      `📝 *Message Preview:*\n${text || '_(Photo announcement without caption)_'}\n\n` +
      `Are you sure you want to send this broadcast to all users?`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Confirm & Send Broadcast Now', 'admin_confirm_broadcast')],
      [Markup.button.callback('❌ Cancel', 'admin_main')],
    ]);

    if (fileId) {
      await ctx.replyWithPhoto(fileId, {
        caption: previewText,
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup,
      });
    } else {
      await ctx.reply(previewText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup,
      });
    }
    return;
  }

  // Stock Upload Wizard & Direct Price Edit — Step 1: Price Input
  if (state === 'AWAITING_STOCK_PRICE' && adminData.variantId) {
    const { variantId, productName, variantName, currentPrice, directPriceEdit } = adminData;

    if (text.toLowerCase() === 'skip') {
      if (directPriceEdit) {
        ctx.session!.adminState = undefined;
        ctx.session!.adminData = undefined;
        await ctx.reply(`✅ *Price kept at Rs. ${Number(currentPrice).toFixed(2)} PKR* (no changes made).`, {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📦 Products Management', 'admin_products')],
            [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
          ]).reply_markup,
        });
        return;
      }

      // Keep existing price, move straight to stock entry
      ctx.session!.adminState = 'AWAITING_STOCK_INPUT';

      await ctx.reply(
        `✅ *Price kept at Rs. ${Number(currentPrice).toFixed(2)} PKR*\n\n` +
        `📥 *Now send the stock entry for ${productName}:*\n\n` +
        `Reply with the account / key (e.g. \`email@example.com:password\`)\n\n` +
        `🔒 It will be AES-256 encrypted before saving.`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_stock')]]).reply_markup,
        }
      );
      return;
    }

    const cleanPrice = text.replace(/,/g, '').replace(/[^0-9.]/g, '');
    const newPrice = parseFloat(cleanPrice);
    if (isNaN(newPrice) || newPrice < 0) {
      await ctx.reply(
        '⚠️ Invalid price. Please enter a valid number (e.g. `1500` or `1500 PKR`) or type `skip` to keep the current price.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      // Update price in database
      await ProductService.updateVariantPrice(variantId, newPrice);

      if (directPriceEdit) {
        ctx.session!.adminState = undefined;
        ctx.session!.adminData = undefined;

        await ctx.reply(
          `🎉 *Price for "${productName}" updated to Rs. ${newPrice.toFixed(2)} PKR!*`,
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
              [Markup.button.callback('📦 Products Management', 'admin_products')],
              [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
            ]).reply_markup,
          }
        );
        return;
      }

      // Advance to stock entry step
      ctx.session!.adminState = 'AWAITING_STOCK_INPUT';
      ctx.session!.adminData = { ...adminData, currentPrice: newPrice };

      await ctx.reply(
        `✅ *Price updated to Rs. ${newPrice.toFixed(2)} PKR!*\n\n` +
        `📥 *Now send the stock entry for ${productName}:*\n\n` +
        `Reply with the account / key (e.g. \`email@example.com:password\`)\n\n` +
        `🔒 It will be AES-256 encrypted before saving.`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_stock')]]).reply_markup,
        }
      );
    } catch (err: any) {
      logger.error('Failed to update variant price', { error: err.message, variantId });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;
      await ctx.reply(`⚠️ Failed to update price: ${err.message}`, {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]]).reply_markup,
      });
    }
    return;
  }

  // Stock Upload Wizard — Import the entire reply as ONE single stock item
  if (state === 'AWAITING_STOCK_INPUT' && adminData.variantId) {
    const { variantId, productName } = adminData;

    // Treat the whole message as a single stock entry (no line splitting)
    const stockEntry = text.trim();

    if (!stockEntry) {
      await ctx.reply('⚠️ Empty input. Please reply with a valid account or key (e.g. `email@example.com:password`).', { parse_mode: 'Markdown' });
      return;
    }

    try {
      const result = await AdminService.importBulkStock(variantId, [stockEntry]);

      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;

      const availableStock = await ProductService.getAvailableStockCount(variantId);

      let summaryMsg: string;
      if (result.duplicateCount > 0) {
        summaryMsg =
          `⚠️ *Duplicate Detected!*\n\n` +
          `📦 *Product:* ${productName}\n` +
          `🏷 *Sub-Category / Plan:* ${adminData.variantName || 'Selected Plan'}\n` +
          `This stock entry already exists in the database. Nothing was added.\n` +
          `📊 *Total Live Stock for this Plan:* ${availableStock} items available`;
      } else {
        summaryMsg =
          `✅ *1 Stock Item Added & Encrypted!*\n\n` +
          `📦 *Product:* ${productName}\n` +
          `🏷 *Sub-Category / Plan:* ${adminData.variantName || 'Selected Plan'}\n` +
          `📊 *Total Live Stock for this Plan:* ${availableStock} items available`;
      }

      await ctx.reply(summaryMsg, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📥 Add Another Account to this Plan', `admin_add_stock_${variantId}`)],
          [Markup.button.callback('📦 Product Stock Overview', `admin_stock_prod_${adminData.productId || ''}`)],
          [Markup.button.callback('📦 All Stock Management', 'admin_stock')],
        ]).reply_markup,
      });
    } catch (err: any) {
      logger.error('Failed to import stock item', { error: err.message, variantId });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;
      await ctx.reply(`⚠️ Failed to add stock: ${err.message}`, {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Stock Management', 'admin_stock')]]).reply_markup,
      });
    }
    return;
  }

  // 💰 Edit Sub-Category Price State
  if (state === 'AWAITING_VAR_EDIT_PRICE' && adminData.variantId) {
    const { variantId, productName, variantName, productId } = adminData;
    const cleanPrice = text.replace(/,/g, '').replace(/[^0-9.]/g, '');
    const newPrice = parseFloat(cleanPrice);

    if (isNaN(newPrice) || newPrice < 0) {
      await ctx.reply('⚠️ Invalid price. Please enter a valid number (e.g. `800` or `1500`):', { parse_mode: 'Markdown' });
      return;
    }

    try {
      const updated = await ProductService.updateVariant(variantId, { price: newPrice });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;

      await ctx.reply(
        `🎉 *Price for "${updated.name}" updated to Rs. ${newPrice.toFixed(2)} PKR!*`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🏷 View Sub-Category Details', `admin_var_view_${variantId}`)],
            [Markup.button.callback('🗂 All Sub-Categories', `admin_prod_vars_${productId}`)],
            [Markup.button.callback('📦 Product Details', `admin_prod_view_${productId}`)],
          ]).reply_markup,
        }
      );
    } catch (err: any) {
      logger.error('Failed to update variant price', { error: err.message, variantId });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;
      await ctx.reply(`⚠️ Failed to update price: ${err.message}`);
    }
    return;
  }

  // 🏷 Edit Sub-Category Name State
  if (state === 'AWAITING_VAR_EDIT_NAME' && adminData.variantId) {
    const { variantId, productId } = adminData;
    if (!text || text.length > 100) {
      await ctx.reply('⚠️ Plan name must be between 1 and 100 characters. Please try again:');
      return;
    }

    try {
      const updated = await ProductService.updateVariant(variantId, { name: text });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;

      await ctx.reply(
        `✅ *Plan name updated to:* *${updated.name}*`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🏷 View Sub-Category Details', `admin_var_view_${variantId}`)],
            [Markup.button.callback('🗂 All Sub-Categories', `admin_prod_vars_${productId}`)],
            [Markup.button.callback('📦 Product Details', `admin_prod_view_${productId}`)],
          ]).reply_markup,
        }
      );
    } catch (err: any) {
      logger.error('Failed to update variant name', { error: err.message, variantId });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;
      await ctx.reply(`⚠️ Failed to update name: ${err.message}`);
    }
    return;
  }

  // 📝 Edit Sub-Category Warranty / Duration / Details State
  if (state === 'AWAITING_VAR_EDIT_DETAILS' && adminData.variantId) {
    const { variantId, productId } = adminData;
    const newDetails = text.toLowerCase() === 'clear' ? null : text;

    try {
      const updated = await ProductService.updateVariant(variantId, { duration: newDetails });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;

      const detailStr = newDetails ? `*${newDetails}*` : '_(Cleared)_';
      await ctx.reply(
        `✅ *Warranty / Details updated to:* ${detailStr}`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('🏷 View Sub-Category Details', `admin_var_view_${variantId}`)],
            [Markup.button.callback('🗂 All Sub-Categories', `admin_prod_vars_${productId}`)],
            [Markup.button.callback('📦 Product Details', `admin_prod_view_${productId}`)],
          ]).reply_markup,
        }
      );
    } catch (err: any) {
      logger.error('Failed to update variant details', { error: err.message, variantId });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;
      await ctx.reply(`⚠️ Failed to update details: ${err.message}`);
    }
    return;
  }

  // ➕ Add Sub-Category / Plan — Step 1: Name -> Step 2: Warranty / Details
  if (state === 'AWAITING_NEW_VAR_NAME' && adminData.productId) {
    if (!text || text.length > 100) {
      await ctx.reply('⚠️ Plan name must be between 1 and 100 characters. Please enter a valid name:');
      return;
    }
    adminData.varName = text;
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_NEW_VAR_DETAILS';

    await ctx.reply(
      `✅ Plan Name set: *${text}*\n\n*(Step 2/3)* Reply with the *Warranty / Duration / Plan Details* (e.g. \`20 Days Replacement Warranty\` or \`Private UHD 4 Screens\`), or type \`skip\` if none:`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', `admin_prod_vars_${adminData.productId}`)]]).reply_markup,
      }
    );
    return;
  }

  // ➕ Add Sub-Category / Plan — Step 2: Warranty / Details -> Step 3: Price
  if (state === 'AWAITING_NEW_VAR_DETAILS' && adminData.productId) {
    adminData.varDuration = text.toLowerCase() === 'skip' ? null : text;
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_NEW_VAR_PRICE';

    await ctx.reply(
      `✅ Warranty/Details saved: *${adminData.varDuration || 'None'}*\n\n*(Step 3/3)* Now reply with the *Price in PKR* for this plan (e.g. \`800\` or \`1500\`):`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', `admin_prod_vars_${adminData.productId}`)]]).reply_markup,
      }
    );
    return;
  }

  // ➕ Add Sub-Category / Plan — Step 3: Price -> Create Variant in Real-Time!
  if (state === 'AWAITING_NEW_VAR_PRICE' && adminData.productId) {
    const cleanPrice = text.replace(/,/g, '').replace(/[^0-9.]/g, '');
    const priceNum = parseFloat(cleanPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      await ctx.reply('⚠️ Invalid price! Please enter a valid number (e.g. `800` or `1500 PKR`):', {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', `admin_prod_vars_${adminData.productId}`)]]).reply_markup,
      });
      return;
    }

    const { productId, productName, varName, varDuration } = adminData;

    try {
      const variant = await ProductService.createVariant(
        productId,
        varName,
        priceNum,
        DeliveryType.AUTOMATIC,
        varDuration || undefined,
        undefined,
        'PKR'
      );

      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;

      const durationStr = varDuration ? `• *Warranty / Details:* ${varDuration}\n` : '';
      const successMsg =
        `🎉 *Sub-Category / Plan Added Successfully!*\n\n` +
        `📦 *Product:* ${productName}\n` +
        `🏷 *Plan Name:* *${variant.name}*\n` +
        durationStr +
        `💰 *Price:* Rs. ${priceNum.toFixed(2)} PKR\n` +
        `🚀 *Delivery Mode:* ⚡ Instant Automatic Delivery\n` +
        `📊 *Status:* ✅ Active`;

      await ctx.reply(successMsg, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📥 Add Stock to this Plan Now', `admin_add_stock_${variant.id}`)],
          [Markup.button.callback('🗂 All Sub-Categories', `admin_prod_vars_${productId}`)],
          [Markup.button.callback('📦 Product Details', `admin_prod_view_${productId}`)],
        ]).reply_markup,
      });
    } catch (err: any) {
      logger.error('Failed to create new variant', { error: err.message, adminData });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;
      await ctx.reply(`⚠️ Failed to create plan: ${err.message}`, {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🗂 All Sub-Categories', `admin_prod_vars_${productId}`)]]).reply_markup,
      });
    }
    return;
  }

  if (!state) return next();

  // Category Creation Wizard
  if (state === 'AWAITING_CATEGORY_NAME') {
    if (!text) {
      await ctx.reply('⚠️ Category name cannot be empty. Please reply with a valid category name:');
      return;
    }

    try {
      const category = await ProductService.createCategory(text);
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;

      await ctx.reply(`✅ *Category "${category.name}" Created in Real-Time!*`, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('➕ Add Product to this Category', `admin_select_cat_${category.id}`)],
          [Markup.button.callback('🗂 Category Management', 'admin_categories')],
          [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
        ]).reply_markup,
      });
    } catch (err: any) {
      logger.error('Failed to create category', { error: err.message });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;
      await ctx.reply(`⚠️ Failed to create category: ${err.message}`, {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🗂 Categories', 'admin_categories')]]).reply_markup,
      });
    }
    return;
  }

  // Product Creation Wizard — Step 2: Name -> Ask Description
  if (state === 'AWAITING_PRODUCT_NAME') {
    if (!text) {
      await ctx.reply('⚠️ Product name cannot be empty. Please enter a product name:');
      return;
    }
    adminData.name = text;
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_PRODUCT_DESCRIPTION';

    await ctx.reply(
      `✅ Product Name set: *${text}*\n\n*(Step 3/5)* Now reply with the *Product Description*:`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_products')]]).reply_markup,
      }
    );
    return;
  }

  // Product Creation Wizard — Step 3: Description -> Ask Initial Plan Name
  if (state === 'AWAITING_PRODUCT_DESCRIPTION') {
    adminData.description = text || '';
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_PRODUCT_PLAN_NAME';

    await ctx.reply(
      `✅ Description saved!\n\n*(Step 4/5)* Reply with the *First Sub-Category / Plan Name* (e.g. \`1 Month (20 Days Warranty)\` or \`Standard Plan\`):\n\n_Or type \`skip\` to use "Standard Plan"_`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_products')]]).reply_markup,
      }
    );
    return;
  }

  // Product Creation Wizard — Step 4: Plan Name -> Ask Warranty Details
  if (state === 'AWAITING_PRODUCT_PLAN_NAME') {
    const planName = text.toLowerCase() === 'skip' || !text ? 'Standard Plan' : text;
    adminData.planName = planName;
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_PRODUCT_PLAN_DETAILS';

    await ctx.reply(
      `✅ Plan Name set: *${planName}*\n\n*(Step 5/6)* Reply with *Warranty / Duration Details* (e.g. \`20 Days Replacement Warranty\` or \`30 Days Full Warranty\`):\n\n_Or type \`skip\` if none_`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_products')]]).reply_markup,
      }
    );
    return;
  }

  // Product Creation Wizard — Step 5: Warranty Details -> Ask Price
  if (state === 'AWAITING_PRODUCT_PLAN_DETAILS') {
    const planDuration = text.toLowerCase() === 'skip' ? null : text;
    adminData.planDuration = planDuration;
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_PRODUCT_PRICE';

    await ctx.reply(
      `✅ Warranty/Details set: *${planDuration || 'None'}*\n\n*(Final Step)* Reply with the *Price in PKR* for this plan (e.g. \`800\` or \`1500\`):`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_products')]]).reply_markup,
      }
    );
    return;
  }

  // Product Creation Wizard — Step 6: Price -> Create Product & Initial Variant Real-Time!
  if (state === 'AWAITING_PRODUCT_PRICE') {
    const cleanPrice = text.replace(/,/g, '').replace(/[^0-9.]/g, '');
    const priceNum = parseFloat(cleanPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      await ctx.reply('⚠️ Invalid price! Please enter a valid number (e.g. `500` or `1200 PKR`):', {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_products')]]).reply_markup,
      });
      return;
    }

    const { categoryId, categoryName, name, description, planName, planDuration } = adminData;

    try {
      // Create Product & Variant in Database Real-Time!
      const product = await ProductService.createProduct(categoryId, name, description);
      const variant = await ProductService.createVariant(
        product.id,
        planName || 'Standard Plan',
        priceNum,
        DeliveryType.AUTOMATIC,
        planDuration || undefined,
        undefined,
        'PKR'
      );

      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;

      const durationStr = planDuration ? `• *Warranty / Details:* ${planDuration}\n` : '';
      const successMsg =
        `🎉 *Product Added Live to Store in Real-Time!*\n\n` +
        `📦 *Product Name:* ${product.name}\n` +
        `📁 *Category:* ${categoryName || 'Store Category'}\n` +
        `🏷 *Initial Plan:* *${variant.name}*\n` +
        durationStr +
        `💰 *Price:* Rs. ${priceNum.toFixed(2)} PKR\n` +
        `📊 *Status:* Active & Live in Store`;

      await ctx.reply(successMsg, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('📥 Add Stock to this Plan', `admin_add_stock_${variant.id}`)],
          [Markup.button.callback('➕ Add More Sub-Categories / Plans', `admin_var_add_${product.id}`)],
          [Markup.button.callback('📦 Products Management', 'admin_products')],
          [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
        ]).reply_markup,
      });
    } catch (err: any) {
      logger.error('Failed to create product at price step', { error: err.message, adminData });
      ctx.session!.adminState = undefined;
      ctx.session!.adminData = undefined;
      await ctx.reply(`⚠️ Failed to create product: ${err.message}`, {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('📦 Products Management', 'admin_products')]]).reply_markup,
      });
    }
    return;
  }

  return next();
});
