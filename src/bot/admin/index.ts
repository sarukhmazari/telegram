import { Composer, Markup } from 'telegraf';
import { BotContext } from '../../types/context.js';
import { adminGuard } from '../middleware/auth.js';
import {
  getAdminMainKeyboard,
  getPaymentReviewKeyboard,
  getAdminProductsKeyboard,
  getAdminCategoriesKeyboard,
} from '../keyboards/admin.js';
import { AdminService } from '../../services/adminService.js';
import { ProductService } from '../../services/productService.js';
import { BroadcastService } from '../../services/broadcastService.js';
import { prisma } from '../../database/index.js';
import { logger } from '../../utils/logger.js';
import { PaymentStatus, DeliveryType } from '@prisma/client';

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

  let text = `📦 *Stock & Account Management*\n\nSelect a product below to upload Gmails, Netflix logins, or license keys:\n\n`;
  const buttons: any[] = [];

  variants.forEach((v) => {
    const stockCount = v.stockItems.length;
    text += `• *${v.product.name}* — Current Stock: *${stockCount} accounts*\n`;
    buttons.push([Markup.button.callback(`📥 Add Stock: ${v.product.name}`, `admin_add_stock_${v.id}`)]);
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

// 📥 Select Variant for Stock Upload
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
  ctx.session.adminState = 'AWAITING_STOCK_INPUT';
  ctx.session.adminData = { variantId, productName: variant.product.name, variantName: variant.name };

  const promptText =
    `📥 *Upload Accounts / Stock for ${variant.product.name}*\n\n` +
    `Please reply with your accounts line-by-line (or paste them in one message):\n\n` +
    `*Example Format (One per line):*\n` +
    `\`email1@gmail.com:password123\`\n` +
    `\`email2@gmail.com:password456\`\n` +
    `\`email3@gmail.com:password789\`\n\n` +
    `🔒 *All accounts will be AES-256 encrypted before saving.*`;

  await ctx.editMessageText(promptText, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'admin_stock')]]).reply_markup,
  });
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

  const isAccountFormat = text.includes(':') || text.includes('@');

  // Stock Upload Wizard — Import Accounts Line-by-Line when in AWAITING_STOCK_INPUT state
  if (state === 'AWAITING_STOCK_INPUT' && adminData.variantId) {
    const { variantId, productName } = adminData;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    if (lines.length === 0) {
      await ctx.reply('⚠️ No valid lines found. Please reply with at least one account/key (e.g. `user:pass`).', { parse_mode: 'Markdown' });
      return;
    }

    const result = await AdminService.importBulkStock(variantId, lines);

    ctx.session!.adminState = undefined;
    ctx.session!.adminData = undefined;

    const availableStock = await ProductService.getAvailableStockCount(variantId);

    const summaryMsg =
      `🎉 *Accounts Successfully Uploaded & Encrypted!*\n\n` +
      `📦 *Product:* ${productName}\n` +
      `✅ *Imported:* ${result.importedCount} accounts\n` +
      `⚠️ *Duplicates Skipped:* ${result.duplicateCount}\n` +
      `📊 *Total Live Stock:* ${availableStock} items available`;

    await ctx.reply(summaryMsg, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('📦 Back to Stock Management', 'admin_stock')]]).reply_markup,
    });
    return;
  }

  // If no active state OR if session was reset, but admin pastes accounts (user:pass format)
  if (isAccountFormat && ctx.isAdmin) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      if (!ctx.session) ctx.session = {};
      ctx.session.pendingStockLines = lines;

      const variants = await prisma.productVariant.findMany({
        include: { product: true },
        orderBy: { createdAt: 'desc' },
      });

      if (variants.length > 0) {
        const buttons = variants.map((v) => [
          Markup.button.callback(`📥 Add ${lines.length} Account(s) to ${v.product.name}`, `admin_assign_stock_${v.id}`),
        ]);

        await ctx.reply(
          `📥 *Detected ${lines.length} account line(s)!*\n\nSelect which product to upload these accounts to:`,
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
          }
        );
        return;
      }
    }
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
