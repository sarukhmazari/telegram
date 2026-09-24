import { Composer, Markup } from 'telegraf';
import { BotContext } from '../../types/context.js';
import { adminGuard } from '../middleware/auth.js';
import {
  getAdminMainKeyboard,
  getPaymentReviewKeyboard,
  getAdminProductsKeyboard,
  getAdminCategoriesKeyboard,
  getBotSettingsKeyboard,
  getPaymentAccountsKeyboard,
  getPaymentAccountDetailKeyboard,
  getRolesManagementKeyboard,
  getRoleAssignmentKeyboard,
} from '../keyboards/admin.js';
import { AdminService } from '../../services/adminService.js';
import { ProductService } from '../../services/productService.js';
import { BroadcastService } from '../../services/broadcastService.js';
import { PaymentAccountService } from '../../services/paymentAccountService.js';
import { UserService } from '../../services/userService.js';
import { prisma } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { PaymentStatus, DeliveryType, Role } from '@prisma/client';

export const adminComposer = new Composer<BotContext>();

// Apply admin auth guard to all routes in this composer
adminComposer.use(adminGuard);

// ⚙️ Admin Main Menu
adminComposer.action('admin_main', async (ctx) => {
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }
  const msg = `⚙️ *Store Admin Panel*\n\nSelect a management option below:`;
  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getAdminMainKeyboard().reply_markup,
  });
});

// 📊 Dashboard Metrics
adminComposer.action('admin_dashboard', async (ctx) => {
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

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getAdminMainKeyboard().reply_markup,
  });
});

// 📦 Products Management Screen
adminComposer.action('admin_products', async (ctx) => {
  const categories = await ProductService.getAllCategories();
  const msg = `📦 *Product Management*\n\nYou can add new products in real-time or view current inventory.\nTotal Active Categories: ${categories.length}`;
  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getAdminProductsKeyboard().reply_markup,
  });
});

// 🗂 Categories Management Screen
adminComposer.action('admin_categories', async (ctx) => {
  const categories = await ProductService.getAllCategories();
  let text = `🗂 *Category Management*\n\nActive Categories (${categories.length}):\n`;
  categories.forEach((c) => {
    text += `• ${c.name}\n`;
  });

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: getAdminCategoriesKeyboard().reply_markup,
  });
});

// ➕ Add New Category Action
adminComposer.action('admin_add_category', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_CATEGORY_NAME';

  await ctx.editMessageText('➕ *Add New Store Category*\n\nPlease reply with the category name (e.g., `🍿 Disney+` or `🎮 PlayStation`):', {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_main')]]).reply_markup,
  });
});

// ➕ Add New Product Action — Step 1: Select Category
adminComposer.action('admin_add_product', async (ctx) => {
  const categories = await ProductService.getActiveCategories();
  if (categories.length === 0) {
    await ctx.answerCbQuery('Please add at least one category first!', { show_alert: true });
    return;
  }

  const buttons = categories.map((c) => [
    Markup.button.callback(`${c.name}`, `admin_select_cat_${c.id}`),
  ]);
  buttons.push([Markup.button.callback('❌ Cancel', 'admin_main')]);

  await ctx.editMessageText('➕ *Add New Product (Step 1/3)*\n\nSelect the category for the new product:', {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
  });
});

// ➕ Add New Product — Step 2: Category Selected -> Ask Product Name
adminComposer.action(/^admin_select_cat_(.+)$/, async (ctx) => {
  const categoryId = ctx.match[1];
  const category = await ProductService.getCategoryById(categoryId);

  if (!category) {
    await ctx.answerCbQuery('Category not found.');
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_PRODUCT_NAME';
  ctx.session.adminData = { categoryId, categoryName: category.name };

  await ctx.editMessageText(
    `➕ *Add New Product to ${category.name} (Step 2/3)*\n\nPlease reply with the *Product Name* (e.g. \`ChatGPT Plus 1 Month Private Account\`):`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_main')]]).reply_markup,
    }
  );
});

// 💳 Pending Payments Review
adminComposer.action('admin_payments', async (ctx) => {
  const pendingPayments = await prisma.payment.findMany({
    where: { status: PaymentStatus.WAITING_FOR_VERIFICATION },
    include: { user: true, order: true },
    orderBy: { createdAt: 'asc' },
    take: 5,
  });

  if (pendingPayments.length === 0) {
    await ctx.editMessageText('💳 *Payment Reviews*\n\nNo pending manual payment verification requests.', {
      parse_mode: 'Markdown',
      reply_markup: getAdminMainKeyboard().reply_markup,
    });
    return;
  }

  const payment = pendingPayments[0];
  const msg =
    `💳 *Pending Payment Review* (1 of ${pendingPayments.length})\n\n` +
    `Order Number: #${payment.order.orderNumber}\n` +
    `Customer: ${payment.user.username ? '@' + payment.user.username : payment.user.id}\n` +
    `Amount: *Rs. ${Number(payment.amount).toFixed(2)} ${payment.currency}*\n` +
    `Reference: \`${payment.transactionReference || 'None'}\``;

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getPaymentReviewKeyboard(payment.id).reply_markup,
  });
});

// ✅ Approve Payment
adminComposer.action(/^admin_approve_pay_(.+)$/, async (ctx) => {
  const paymentId = ctx.match[1];
  
  await ctx.answerCbQuery('✅ Processing approval...').catch(() => {});

  try {
    const success = await AdminService.approvePayment(paymentId, 'Approved by Admin', ctx as any);

    if (success) {
      await ctx.answerCbQuery('✅ Payment approved & digital delivery dispatched!', { show_alert: true }).catch(() => {});
      
      const successText = '✅ *Payment Approved & Digital Delivery Dispatched!*';
      const keyboard = Markup.inlineKeyboard([[Markup.button.callback('⚙️ Admin Panel', 'admin_main')]]);

      if (ctx.callbackQuery?.message && 'photo' in ctx.callbackQuery.message) {
        await ctx.editMessageCaption(successText, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup,
        }).catch(() => {});
      } else {
        await ctx.editMessageText(successText, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup,
        }).catch(() => {});
      }
    } else {
      await ctx.answerCbQuery('⚠️ Could not approve payment (out of stock or already processed).', { show_alert: true }).catch(() => {});
    }
  } catch (err: any) {
    logger.error('Error in approvePayment handler', { error: err.message });
    await ctx.answerCbQuery(`⚠️ Error: ${err.message || 'Approval failed'}`, { show_alert: true }).catch(() => {});
  }
});

// ❌ Reject Payment
adminComposer.action(/^admin_reject_pay_(.+)$/, async (ctx) => {
  const paymentId = ctx.match[1];
  
  await ctx.answerCbQuery('❌ Rejecting payment...').catch(() => {});

  try {
    await AdminService.rejectPayment(paymentId, 'Rejected by Admin', ctx as any);
    await ctx.answerCbQuery('❌ Payment rejected & customer notified.', { show_alert: true }).catch(() => {});

    const rejectedText = '❌ *Payment Rejected & Customer Notified.*';
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('⚙️ Admin Panel', 'admin_main')]]);

    if (ctx.callbackQuery?.message && 'photo' in ctx.callbackQuery.message) {
      await ctx.editMessageCaption(rejectedText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup,
      }).catch(() => {});
    } else {
      await ctx.editMessageText(rejectedText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup,
      }).catch(() => {});
    }
  } catch (err: any) {
    logger.error('Error in rejectPayment handler', { error: err.message });
  }
});

// 📦 Stock Management Screen
adminComposer.action('admin_stock', async (ctx) => {
  const variants = await prisma.productVariant.findMany({
    include: {
      product: true,
      stockItems: {
        where: { isSold: false, lockedAt: null },
        select: { id: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (variants.length === 0) {
    await ctx.editMessageText('📦 *Stock Management*\n\nNo product variants available. Please create a product first!', {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]]).reply_markup,
    });
    return;
  }

  let text = `📦 *Stock & Account Management*\n\nSelect a product below to upload or delete accounts/stock:\n\n`;
  const buttons: any[] = [];

  variants.forEach((v) => {
    const stockCount = v.stockItems.length;
    text += `• *${v.product.name}* — Current Stock: *${stockCount} accounts*\n`;
    buttons.push([
      Markup.button.callback(`📥 Add Stock: ${v.product.name}`, `admin_add_stock_${v.id}`),
      Markup.button.callback(`🗑 Delete Stock`, `admin_delete_stock_variant_${v.id}`),
    ]);
  });

  buttons.push([Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]);

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
  });
});

// 📋 Orders Management Screen
adminComposer.action('admin_orders', async (ctx) => {
  const totalOrders = await prisma.order.count();
  const pendingOrders = await prisma.order.count({ where: { orderStatus: 'PENDING' } });
  const completedOrders = await prisma.order.count({ where: { orderStatus: 'COMPLETED' } });

  const msg =
    `📋 *Order Management*\n\n` +
    `• Total Orders: *${totalOrders}*\n` +
    `• Pending Orders: *${pendingOrders}*\n` +
    `• Completed Orders: *${completedOrders}*`;

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]]).reply_markup,
  });
});

// 👥 Users Management Screen
adminComposer.action('admin_users', async (ctx) => {
  const totalUsers = await prisma.user.count();
  const bannedUsers = await prisma.user.count({ where: { isBanned: true } });

  const msg =
    `👥 *Customer & User Management*\n\n` +
    `• Total Registered Customers: *${totalUsers}*\n` +
    `• Suspended/Banned Accounts: *${bannedUsers}*`;

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]]).reply_markup,
  });
});

// 🎟 Coupons Screen
adminComposer.action('admin_coupons', async (ctx) => {
  const coupons = await prisma.coupon.findMany();
  let text = `🎟 *Discount Coupons*\n\nActive Coupons (${coupons.length}):\n`;
  if (coupons.length === 0) text += `No coupons created yet.`;
  coupons.forEach((c) => {
    text += `• \`${c.code}\` — ${c.discountType === 'PERCENTAGE' ? c.discountValue + '%' : '$' + c.discountValue}\n`;
  });

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]]).reply_markup,
  });
});

// 📢 Broadcast Screen — Prompt Admin for Broadcast Text/Photo
adminComposer.action('admin_broadcast', async (ctx) => {
  const userCount = await prisma.user.count({ where: { isBanned: false } });

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_BROADCAST_MESSAGE';

  const msg =
    `📢 *Customer Mass Broadcast*\n\n` +
    `👥 *Total Reachable Customers:* *${userCount} users*\n\n` +
    `Please reply directly to this chat with your *announcement text* or *photo with caption* to send to all registered bot users.\n\n` +
    `_(Supports Markdown formatting like *bold*, _italic_, and line breaks)_`;

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_main')]]).reply_markup,
  });
});

// 🚀 Confirm & Dispatch Broadcast Action
adminComposer.action('admin_confirm_broadcast', async (ctx) => {
  const adminData = ctx.session?.adminData;
  if (!adminData || (!adminData.broadcastText && !adminData.fileId)) {
    await ctx.answerCbQuery('⚠️ Broadcast message context lost. Please try again.', { show_alert: true });
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

  if (ctx.callbackQuery?.message && 'photo' in ctx.callbackQuery.message) {
    await ctx.editMessageCaption(confirmMsg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup,
    }).catch(() => {});
  } else {
    await ctx.editMessageText(confirmMsg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup,
    }).catch(() => {});
  }
});

// ⭐ Reviews Screen
adminComposer.action('admin_reviews', async (ctx) => {
  const totalReviews = await prisma.review.count();
  const msg = `⭐ *Customer Reviews Moderation*\n\nTotal Product Reviews: *${totalReviews}*`;
  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]]).reply_markup,
  });
});

// 📥 Select Variant for Stock Upload — Step 1: Ask for Price
adminComposer.action(/^admin_add_stock_(.+)$/, async (ctx) => {
  const variantId = ctx.match[1];
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });

  if (!variant) {
    await ctx.answerCbQuery('Product variant not found.');
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_STOCK_PRICE';
  ctx.session.adminData = { variantId, productName: variant.product.name, variantName: variant.name, currentPrice: Number(variant.price) };

  const promptText =
    `💰 *Set Price — ${variant.product.name}*\n\n` +
    `Current Price: *Rs. ${Number(variant.price).toFixed(2)} PKR*\n\n` +
    `Reply with the *new price in PKR* to update it, or type \`skip\` to keep the current price.\n\n` +
    `Example: \`1500\` or \`skip\``;

  await ctx.editMessageText(promptText, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_stock')]]).reply_markup,
  });
});

// 🗑 Delete Stock — Select Variant
adminComposer.action(/^admin_delete_stock_variant_(.+)$/, async (ctx) => {
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
    await ctx.answerCbQuery('Variant not found.');
    return;
  }

  if (variant.stockItems.length === 0) {
    await ctx.answerCbQuery('No available stock items to delete.', { show_alert: true });
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

  await ctx.editMessageText(
    `🗑 *Delete Stock — ${variant.product.name}*\n\nShowing up to 20 unsold items. Tap one to delete it permanently:`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    }
  );
});

// 🗑 Delete Stock Item — Confirm & Execute
adminComposer.action(/^admin_delete_stock_item_(.+)$/, async (ctx) => {
  const itemId = ctx.match[1];

  const item = await prisma.stockItem.findUnique({
    where: { id: itemId },
    include: { variant: { include: { product: true } } },
  });

  if (!item) {
    await ctx.answerCbQuery('Stock item not found or already deleted.', { show_alert: true });
    return;
  }

  if (item.isSold) {
    await ctx.answerCbQuery('⚠️ Cannot delete a sold stock item.', { show_alert: true });
    return;
  }

  await prisma.stockItem.delete({ where: { id: itemId } });

  const remaining = await ProductService.getAvailableStockCount(item.variantId);

  await ctx.answerCbQuery('✅ Stock item deleted successfully.', { show_alert: true });
  await ctx.editMessageText(
    `✅ *Stock item deleted.*\n\n📦 *Product:* ${item.variant.product.name}\n📊 *Remaining Stock:* ${remaining} items`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🗑 Delete More', `admin_delete_stock_variant_${item.variantId}`)],
        [Markup.button.callback('📦 Stock Management', 'admin_stock')],
      ]).reply_markup,
    }
  );
});

// 📥 Assign Pending Stock Lines Action
adminComposer.action(/^admin_assign_stock_(.+)$/, async (ctx) => {
  const variantId = ctx.match[1];
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });

  if (!variant) {
    await ctx.answerCbQuery('Product variant not found.');
    return;
  }

  const lines = ctx.session?.pendingStockLines || [];
  if (lines.length === 0) {
    await ctx.answerCbQuery('No pending accounts found to import.', { show_alert: true });
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

  await ctx.editMessageText(summaryMsg, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('📦 Stock Management', 'admin_stock')]]).reply_markup,
  });
});

// 🤖 Bot Settings Screen
adminComposer.action('admin_bot_settings', async (ctx) => {
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

  const msg =
    `🤖 *Bot Profile & Settings*\n\n` +
    `• *Name:* ${me.first_name}\n` +
    `• *Username:* @${me.username}\n` +
    `• *Bio / About:* ${currentBio}\n` +
    `• *Chat Description:* ${currentDesc}\n\n` +
    `Select a setting below to update:`;

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getBotSettingsKeyboard().reply_markup,
  });
});

// 📛 Change Bot Name — Prompt
adminComposer.action('admin_change_name', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_BOT_NAME';

  await ctx.editMessageText(
    `📛 *Change Bot Name*\n\nReply with the new display name for the bot (e.g. \`MazariShop 🛒\`).\n\n_Max 64 characters._`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_bot_settings')]]).reply_markup,
    }
  );
});

// 📝 Change Bot Description — Prompt
adminComposer.action('admin_change_description', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_BOT_DESCRIPTION';

  await ctx.editMessageText(
    `📝 *Change Bot Description*\n\nThis text is shown on the empty chat screen when a user opens the bot for the first time.\n\nReply with the new description.\n\n_Max 512 characters._`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_bot_settings')]]).reply_markup,
    }
  );
});

// 💬 Change Bot Bio / Short Description — Prompt
adminComposer.action('admin_change_short_desc', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_BOT_SHORT_DESC';

  await ctx.editMessageText(
    `💬 *Change Bot Bio / About*\n\nThis is the **Bio** shown on your bot's profile page and in search/share previews.\n\nReply with the new bio (or type \`clear\` to remove).\n\n_Max 120 characters._`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_bot_settings')]]).reply_markup,
    }
  );
});

// 🖼 Change Bot Profile Photo — Info (Telegram API limitation)
adminComposer.action('admin_change_photo', async (ctx) => {
  await ctx.editMessageText(
    `🖼 *Change Bot Profile Photo*\n\n` +
    `⚠️ *Telegram does not allow bots to change their own profile photo via the API.*\n\n` +
    `To update the bot\'s profile picture, please use *BotFather*:\n\n` +
    `1️⃣ Open [@BotFather](https://t.me/BotFather)\n` +
    `2️⃣ Send /setuserpic\n` +
    `3️⃣ Select your bot and send the new photo`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Bot Settings', 'admin_bot_settings')]]).reply_markup,
    }
  );
});

// 💳 Payment Accounts List
adminComposer.action('admin_payment_accounts', async (ctx) => {
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
  }
  const accounts = await PaymentAccountService.getAllAccounts();

  const msg =
    `💳 *Payment Accounts Management*\n\n` +
    `Configure manual transfer accounts (JazzCash, EasyPaisa, Bank accounts, etc.) shown to customers at checkout.\n\n` +
    `Active accounts count: *${accounts.filter((a) => a.isEnabled).length}*`;

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getPaymentAccountsKeyboard(accounts).reply_markup,
  });
});

// 💳 View Single Payment Account
adminComposer.action(/^admin_payacc_view_(.+)$/, async (ctx) => {
  const accountId = ctx.match[1];
  const account = await PaymentAccountService.getAccountById(accountId);

  if (!account) {
    await ctx.answerCbQuery('Payment account not found.');
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

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getPaymentAccountDetailKeyboard(account).reply_markup,
  });
});

// ✏️ Edit Account Number
adminComposer.action(/^admin_payacc_edit_num_(.+)$/, async (ctx) => {
  const accountId = ctx.match[1];
  const account = await PaymentAccountService.getAccountById(accountId);
  if (!account) return;

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_PAYACC_NUMBER';
  ctx.session.adminData = { accountId };

  await ctx.editMessageText(
    `✏️ *Edit Account Number — ${account.providerName}*\n\nCurrent: \`${account.accountNumber}\`\n\nReply with the new account number / IBAN:`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', `admin_payacc_view_${accountId}`)],
      ]).reply_markup,
    }
  );
});

// 🏷 Edit Account Title
adminComposer.action(/^admin_payacc_edit_title_(.+)$/, async (ctx) => {
  const accountId = ctx.match[1];
  const account = await PaymentAccountService.getAccountById(accountId);
  if (!account) return;

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_PAYACC_TITLE';
  ctx.session.adminData = { accountId };

  await ctx.editMessageText(
    `🏷 *Edit Account Title — ${account.providerName}*\n\nCurrent: *${account.accountTitle}*\n\nReply with the new account holder title / name:`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', `admin_payacc_view_${accountId}`)],
      ]).reply_markup,
    }
  );
});

// 📝 Edit Account Instructions
adminComposer.action(/^admin_payacc_edit_instr_(.+)$/, async (ctx) => {
  const accountId = ctx.match[1];
  const account = await PaymentAccountService.getAccountById(accountId);
  if (!account) return;

  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_PAYACC_INSTRUCTIONS';
  ctx.session.adminData = { accountId };

  await ctx.editMessageText(
    `📝 *Edit Instructions — ${account.providerName}*\n\nCurrent:\n${account.instructions || '_(None)_'}\n\nReply with the new instructions, or send \`clear\` to reset:`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', `admin_payacc_view_${accountId}`)],
      ]).reply_markup,
    }
  );
});

// 🔄 Toggle Account Status
adminComposer.action(/^admin_payacc_toggle_(.+)$/, async (ctx) => {
  const accountId = ctx.match[1];
  const updated = await PaymentAccountService.toggleAccount(accountId);

  await ctx.answerCbQuery(
    updated.isEnabled ? '✅ Account enabled for checkout' : '⏸ Account disabled'
  );

  const msg =
    `💳 *Payment Account Details*\n\n` +
    `• *Provider:* ${updated.providerName}\n` +
    `• *Account Number / IBAN:* \`${updated.accountNumber}\`\n` +
    `• *Account Title:* *${updated.accountTitle}*\n` +
    `• *Status:* ${updated.isEnabled ? '✅ Enabled (Visible at checkout)' : '⏸ Disabled (Hidden)'}\n` +
    `• *Instructions:* ${updated.instructions || '_(Default checkout instructions)_'}`;

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getPaymentAccountDetailKeyboard(updated).reply_markup,
  });
});

// 🗑 Delete Account
adminComposer.action(/^admin_payacc_delete_(.+)$/, async (ctx) => {
  const accountId = ctx.match[1];
  await PaymentAccountService.deleteAccount(accountId);
  await ctx.answerCbQuery('🗑 Account deleted successfully.');

  const accounts = await PaymentAccountService.getAllAccounts();
  const msg =
    `💳 *Payment Accounts Management*\n\n` +
    `Account was deleted.\n\n` +
    `Configure manual transfer accounts shown to customers at checkout.\n` +
    `Active accounts: *${accounts.filter((a) => a.isEnabled).length}*`;

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getPaymentAccountsKeyboard(accounts).reply_markup,
  });
});

// ➕ Add New Payment Account Wizard — Step 1: Provider Name
adminComposer.action('admin_payacc_add', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_NEW_PAYACC_PROVIDER';
  ctx.session.adminData = {};

  await ctx.editMessageText(
    `➕ *Add Payment Account (Step 1/4)*\n\nReply with the *Provider / Bank Name* (e.g. \`JazzCash\`, \`EasyPaisa\`, \`Meezan Bank\`, \`SadaPay\`, \`Nayapay\`, \`Binance USDT\`):`,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', 'admin_payment_accounts')],
      ]).reply_markup,
    }
  );
});

// 🛡 Staff & Roles Management Screen
adminComposer.action('admin_roles', async (ctx) => {
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

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getRolesManagementKeyboard(staffUsers).reply_markup,
  });
});

// 🛡 View Single Staff Member / Role Assignment
adminComposer.action(/^admin_roles_view_(.+)$/, async (ctx) => {
  const userId = ctx.match[1];
  const user = await UserService.getUserById(userId);

  if (!user) {
    await ctx.answerCbQuery('User not found.');
    return;
  }

  const userDisplay = user.username ? `@${user.username}` : (user.firstName || user.id);
  const msg =
    `👤 *Staff Member Profile*\n\n` +
    `• *Name/Handle:* ${userDisplay}\n` +
    `• *Telegram ID:* \`${user.telegramId.toString()}\`\n` +
    `• *Current Role:* *${user.role}*\n` +
    `• *Joined:* ${new Date(user.createdAt).toLocaleDateString()}\n\n` +
    `Select a role below to assign:`;

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getRoleAssignmentKeyboard(user.id).reply_markup,
  });
});

// ➕ Add / Change User Role — Prompt
adminComposer.action('admin_roles_add', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.adminState = 'AWAITING_USER_LOOKUP_FOR_ROLE';

  await ctx.editMessageText(
    `➕ *Assign Staff Role*\n\nPlease reply with the *Telegram @username* or numeric *Telegram ID* of the user you wish to promote or manage:\n\nExample: \`@username\` or \`123456789\``,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('❌ Cancel', 'admin_roles')],
      ]).reply_markup,
    }
  );
});

// 👑 / 🛡 / 👤 Role Assignment Execution Action
adminComposer.action(/^admin_roles_set_([A-Z]+)_(.+)$/, async (ctx) => {
  const targetRole = ctx.match[1] as Role;
  const targetUserId = ctx.match[2];

  if (!['OWNER', 'ADMIN', 'USER'].includes(targetRole)) {
    await ctx.answerCbQuery('Invalid role specified.');
    return;
  }

  try {
    const updated = await UserService.setUserRole(targetUserId, targetRole);
    const userDisplay = updated.username ? `@${updated.username}` : (updated.firstName || updated.id);

    await ctx.answerCbQuery(`✅ Role set to ${targetRole}!`, { show_alert: true });

    const msg =
      `✅ *Role Updated Successfully!*\n\n` +
      `• *User:* ${userDisplay} (\`${updated.telegramId.toString()}\`)\n` +
      `• *New Role:* *${updated.role}*`;

    await ctx.editMessageText(msg, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🛡 Staff & Roles', 'admin_roles')],
        [Markup.button.callback('⚙️ Admin Panel', 'admin_main')],
      ]).reply_markup,
    });
  } catch (err: any) {
    logger.error('Failed to set user role', { error: err.message });
    await ctx.answerCbQuery(`⚠️ Error: ${err.message}`, { show_alert: true });
  }
});

// 📩 Message Listener (Text & Photo) for Admin Input Wizard & Broadcasts
adminComposer.on(['text', 'photo'], async (ctx, next) => {
  const state = ctx.session?.adminState;
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
      await ctx.reply(
        `⚠️ User \`${text}\` not found in the bot database.\n\nMake sure the user has started the bot at least once (by sending /start), or check the username/ID and try again.`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅️ Back to Staff', 'admin_roles')]]).reply_markup,
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

  // Stock Upload Wizard — Step 1: Price Input
  if (state === 'AWAITING_STOCK_PRICE' && adminData.variantId) {
    const { variantId, productName, variantName, currentPrice } = adminData;

    if (text.toLowerCase() === 'skip') {
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

    const newPrice = parseFloat(text);
    if (isNaN(newPrice) || newPrice < 0) {
      await ctx.reply(
        '⚠️ Invalid price. Enter a valid number (e.g. `1500`) or type `skip` to keep the current price.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Update price in database
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { price: newPrice },
    });

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

    const result = await AdminService.importBulkStock(variantId, [stockEntry]);

    ctx.session!.adminState = undefined;
    ctx.session!.adminData = undefined;

    const availableStock = await ProductService.getAvailableStockCount(variantId);

    let summaryMsg: string;
    if (result.duplicateCount > 0) {
      summaryMsg =
        `⚠️ *Duplicate Detected!*\n\n` +
        `📦 *Product:* ${productName}\n` +
        `This stock entry already exists in the database. Nothing was added.\n` +
        `📊 *Total Live Stock:* ${availableStock} items available`;
    } else {
      summaryMsg =
        `✅ *1 Stock Item Added & Encrypted!*\n\n` +
        `📦 *Product:* ${productName}\n` +
        `📊 *Total Live Stock:* ${availableStock} items available`;
    }

    await ctx.reply(summaryMsg, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('📦 Back to Stock Management', 'admin_stock')]]).reply_markup,
    });
    return;
  }

  if (!state) return next();

  // Category Creation Wizard
  if (state === 'AWAITING_CATEGORY_NAME') {
    const category = await ProductService.createCategory(text);
    ctx.session!.adminState = undefined;
    await ctx.reply(`✅ *Category "${category.name}" Created in Real-Time!*`, {
      parse_mode: 'Markdown',
      reply_markup: getAdminCategoriesKeyboard().reply_markup,
    });
    return;
  }

  // Product Creation Wizard — Step 2: Name -> Ask Description
  if (state === 'AWAITING_PRODUCT_NAME') {
    adminData.name = text;
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_PRODUCT_DESCRIPTION';

    await ctx.reply(
      `✅ Product Name set: *${text}*\n\n*(Step 3/3)* Now reply with the *Product Description*:`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Product Creation Wizard — Step 3: Description -> Ask Price
  if (state === 'AWAITING_PRODUCT_DESCRIPTION') {
    adminData.description = text;
    ctx.session!.adminData = adminData;
    ctx.session!.adminState = 'AWAITING_PRODUCT_PRICE';

    await ctx.reply(
      `✅ Description saved!\n\n*(Final Step)* Reply with the *Price in PKR* (e.g. \`500\` or \`1200\`):`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Product Creation Wizard — Step 4: Price -> Create Product Real-Time!
  if (state === 'AWAITING_PRODUCT_PRICE') {
    const priceNum = parseFloat(text);
    if (isNaN(priceNum) || priceNum < 0) {
      await ctx.reply('⚠️ Invalid price! Please enter a valid number (e.g. `500` or `0`):', { parse_mode: 'Markdown' });
      return;
    }

    const { categoryId, categoryName, name, description } = adminData;

    // Create Product & Variant in Database Real-Time!
    const product = await ProductService.createProduct(categoryId, name, description);
    await ProductService.createVariant(
      product.id,
      'Standard License',
      priceNum,
      DeliveryType.AUTOMATIC,
      undefined,
      undefined,
      'PKR'
    );

    ctx.session!.adminState = undefined;
    ctx.session!.adminData = undefined;

    const successMsg =
      `🎉 *Product Added Live to Store in Real-Time!*\n\n` +
      `📦 *Product Name:* ${product.name}\n` +
      `📁 *Category:* ${categoryName}\n` +
      `💰 *Price:* Rs. ${priceNum.toFixed(2)} PKR\n` +
      `📊 *Status:* Active & Live in Store`;

    await ctx.reply(successMsg, {
      parse_mode: 'Markdown',
      reply_markup: getAdminProductsKeyboard().reply_markup,
    });
    return;
  }

  return next();
});
