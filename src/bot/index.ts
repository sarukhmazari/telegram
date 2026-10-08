import { Telegraf, session, Markup } from 'telegraf';
import { BotContext } from '../types/context.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { connectDatabase } from '../database/index.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { handleBotError } from './middleware/errorHandler.js';
import { getMainMenuKeyboard } from './keyboards/main.js';
import { getCategoriesKeyboard, getProductsKeyboard, getProductVariantsKeyboard } from './keyboards/store.js';
import { ProductService } from '../services/productService.js';
import { OrderService } from '../services/orderService.js';
import { UserService } from '../services/userService.js';
import { ManualPaymentProvider } from '../payments/providers/manualPaymentProvider.js';
import { WalletPaymentProvider } from '../payments/providers/walletPaymentProvider.js';
import { DeliveryService } from '../services/deliveryService.js';
import { PaymentAccountService } from '../services/paymentAccountService.js';
import { SettingService } from '../services/settingService.js';
import { ReviewService } from '../services/reviewService.js';
import { prisma } from '../database/index.js';
import { getPaymentReviewKeyboard } from './keyboards/admin.js';

import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Auto-detect local proxy (only if environment variable HTTPS_PROXY / https_proxy is defined)
const systemProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const agent = systemProxy ? new HttpsProxyAgent(systemProxy) : undefined;

export const bot = new Telegraf<BotContext>(
  config.BOT_TOKEN && config.BOT_TOKEN.length > 5
    ? config.BOT_TOKEN
    : '0000000000:AAANotConfiguredFallbackTokenXXXXXX',
  {
    telegram: agent ? { agent } : undefined,
  }
);

import { adminComposer } from './admin/index.js';

// Register Middlewares
bot.use(session());
bot.use(rateLimitMiddleware);
bot.use(authMiddleware);
bot.use(adminComposer);

// Global Error Handler
bot.catch(handleBotError);

// /start command
bot.start(async (ctx) => {
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
    ctx.session.userState = undefined;
    ctx.session.userData = undefined;
    ctx.session.pendingStockLines = undefined;
  }

  const userDisplay = ctx.from?.username
    ? `@${ctx.from.username}`
    : (ctx.from?.first_name || `User`);
  const userId = ctx.from?.id ? ` (ID: \`${ctx.from.id}\`)` : '';

  const welcomeText =
    `👋 *Welcome, ${userDisplay}!*${userId}\n\n` +
    `Explore our catalog of digital products, premium accounts, software licenses, and subscription plans.\n\n` +
    `Select an option below to get started:`;

  const bannerPhotoId = await SettingService.getSetting('banner_photo_file_id');

  if (bannerPhotoId) {
    try {
      await ctx.replyWithPhoto(bannerPhotoId, {
        caption: welcomeText,
        parse_mode: 'Markdown',
        reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
      });
      return;
    } catch (err) {
      logger.warn('Failed to send welcome banner photo, falling back to text', { err });
    }
  }

  await ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
  });
});

// Cancel / Stop command
bot.command(['cancel', 'stop'], async (ctx) => {
  if (ctx.session) {
    ctx.session.adminState = undefined;
    ctx.session.adminData = undefined;
    ctx.session.userState = undefined;
    ctx.session.userData = undefined;
    ctx.session.pendingStockLines = undefined;
  }
  await ctx.reply('❌ Current operation cancelled.', getMainMenuKeyboard(ctx.isAdmin));
});

// Text commands
bot.command('shop', async (ctx) => {
  const categories = await ProductService.getActiveCategories();
  if (categories.length === 0) {
    await ctx.reply('No active categories available at the moment.', getMainMenuKeyboard(ctx.isAdmin));
    return;
  }
  await ctx.reply('🛍 *Select a Product Category:*', {
    parse_mode: 'Markdown',
    reply_markup: getCategoriesKeyboard(categories).reply_markup,
  });
});

bot.command('balance', async (ctx) => {
  const balance = Number(ctx.dbUser?.balance || 0).toFixed(2);
  const msg = `💰 *Your Wallet Balance*\n\nCurrent Balance: *Rs. ${balance}*\n\nYou can use your wallet balance for instant payments at checkout.`;
  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
  });
});

bot.command('orders', async (ctx) => {
  if (!ctx.dbUser) return;
  const orders = await OrderService.getUserOrders(ctx.dbUser.id);
  if (orders.length === 0) {
    await ctx.reply('📦 You have no past orders yet.', getMainMenuKeyboard(ctx.isAdmin));
    return;
  }
  let msg = `📦 *Your Order History*\n\n`;
  orders.forEach((o) => {
    msg += `• Order #${o.orderNumber} - *Rs. ${Number(o.totalAmount).toFixed(2)}* [${o.orderStatus}]\n`;
  });
  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
  });
});

bot.command('help', async (ctx) => {
  const supportUser = await SettingService.getSupportUsername();
  const supportStr = supportUser ? `@${supportUser}` : '_(No direct support handle set)_';
  const helpText = `❓ *Store Help & Support*\n\nUse the menu buttons below to browse products, check your wallet balance, or view past orders.\n\nNeed assistance? Contact support handle: ${supportStr}`;
  await ctx.reply(helpText, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
  });
});

// Universal message editor: seamlessly handles text messages, photo caption messages, caption length limits, and markdown fallbacks
export async function safeEditMessage(ctx: BotContext, text: string, replyMarkup?: any) {
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

// /shop or Store button
bot.action('menu_store', async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const categories = await ProductService.getActiveCategories();
  if (categories.length === 0) {
    await ctx.reply('No active categories available at the moment.', getMainMenuKeyboard(ctx.isAdmin));
    return;
  }

  await safeEditMessage(
    ctx,
    '🛍 *Select a Product Category:*',
    getCategoriesKeyboard(categories)
  );
});

// Main menu callback
bot.action('menu_main', async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const userDisplay = ctx.from?.username
    ? `@${ctx.from.username}`
    : (ctx.from?.first_name || `User`);
  const userId = ctx.from?.id ? ` (ID: \`${ctx.from.id}\`)` : '';
  const text = `🏠 *Main Menu*\n\nWelcome back, *${userDisplay}*!${userId}`;

  const bannerPhotoId = await SettingService.getSetting('banner_photo_file_id');

  if (bannerPhotoId && ctx.callbackQuery?.message && !('photo' in ctx.callbackQuery.message)) {
    try {
      await ctx.replyWithPhoto(bannerPhotoId, {
        caption: text,
        parse_mode: 'Markdown',
        reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
      });
      return;
    } catch {
      // Fallback to safeEditMessage below
    }
  }

  await safeEditMessage(ctx, text, getMainMenuKeyboard(ctx.isAdmin));
});

// Balance Menu
bot.action('menu_balance', async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  const balance = Number(user?.balance || 0).toFixed(2);
  const msg =
    `💰 *Your Wallet Balance*\n\n` +
    `Current Balance: *Rs. ${balance}*\n\n` +
    `You can use your wallet balance for instant payments at checkout.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💳 Deposit / Top-up Balance', 'menu_deposit')],
    [Markup.button.callback('🏠 Home', 'menu_main')],
  ]);

  await safeEditMessage(ctx, msg, keyboard);
});

// Deposit / Top-up Balance Action
bot.action('menu_deposit', async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const supportUser = await SettingService.getSupportUsername();
  const supportStr = supportUser ? `@${supportUser}` : '_(No direct support handle set)_';
  const msg =
    `💳 *Wallet Balance Top-up*\n\n` +
    `To add funds to your wallet balance, please contact store support or send manual payment proof:\n\n` +
    `• *Support Handle:* ${supportStr}\n` +
    `• *Accepted Payment Methods:* Binance Pay, USDT TRC20, Bank Transfer, EasyPaisa, JazzCash.\n\n` +
    `Send your transfer reference or screenshot to support to credit your account balance.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Back to Balance', 'menu_balance')],
    [Markup.button.callback('🏠 Home', 'menu_main')],
  ]);

  await safeEditMessage(ctx, msg, keyboard);
});

// Account Menu
bot.action('menu_account', async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  if (!user) return;

  const msg =
    `👤 *My Account Profile*\n\n` +
    `User ID: \`${user.telegramId.toString()}\` \n` +
    `Username: ${user.username ? '@' + user.username : 'N/A'}\n` +
    `Wallet Balance: *Rs. ${Number(user.balance).toFixed(2)}*\n` +
    `Referral Code: \`${user.referralCode}\` \n\n` +
    `Share your referral link to earn rewards:\n` +
    `\`https://t.me/${ctx.botInfo?.username || 'Bot'}?start=${user.referralCode}\``;

  await safeEditMessage(ctx, msg, getMainMenuKeyboard(ctx.isAdmin));
});

// My Orders Menu
bot.action('menu_orders', async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  if (!user) return;

  const orders = await OrderService.getUserOrders(user.id);
  
  if (orders.length === 0) {
    await safeEditMessage(
      ctx,
      '📦 *Your Order History*\n\nYou have no past orders yet.',
      getMainMenuKeyboard(ctx.isAdmin)
    );
    return;
  }

  let msg = `📦 *Your Order History*\n\nSelect an order below to view credentials & details:\n\n`;
  const buttons: any[] = [];
  orders.forEach((o) => {
    msg += `• Order #${o.orderNumber} — *Rs. ${Number(o.totalAmount).toFixed(2)}* [${o.orderStatus}]\n`;
    buttons.push([Markup.button.callback(`📋 #${o.orderNumber} (Rs. ${Number(o.totalAmount).toFixed(2)})`, `view_order_${o.id}`)]);
  });
  buttons.push([Markup.button.callback('🏠 Home', 'menu_main')]);

  await safeEditMessage(ctx, msg, Markup.inlineKeyboard(buttons));
});

// ⭐ Customer Store Reviews Menu
bot.action('menu_reviews', async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const totalReviews = await prisma.review.count({ where: { isApproved: true } });
  const recentReviews = await prisma.review.findMany({
    where: { isApproved: true },
    orderBy: { createdAt: 'desc' },
    include: { product: true, user: true },
    take: 5,
  });

  let avgRating = '5.0';
  if (totalReviews > 0) {
    const all = await prisma.review.findMany({
      where: { isApproved: true },
      select: { rating: true },
    });
    const sum = all.reduce((acc, r) => acc + r.rating, 0);
    avgRating = (sum / all.length).toFixed(1);
  }

  let text =
    `⭐ *Customer Reviews & Ratings*\n\n` +
    `📊 *Average Store Rating:* ⭐ *${avgRating} / 5.0* (${totalReviews} verified reviews)\n\n`;

  if (recentReviews.length === 0) {
    text += `_No public customer reviews submitted yet._\n\n_Purchase any digital product to leave a 1-5 star review after delivery!_`;
  } else {
    text += `*Latest Verified Customer Feedback:*\n\n`;
    recentReviews.forEach((r, i) => {
      const stars = '⭐'.repeat(r.rating);
      const userStr = r.user?.username ? `@${r.user.username}` : (r.user?.firstName || 'Verified Customer');
      const prodName = r.product?.name || 'Digital Item';
      text += `${i + 1}. ${stars} *${prodName}*\n`;
      if (r.comment) text += `   "${r.comment}"\n`;
      text += `   — _${userStr}_\n\n`;
    });
  }

  const buttons = [
    [Markup.button.callback('🛍 Browse Store Products', 'menu_store')],
    [Markup.button.callback('🏠 Return to Main Menu', 'menu_main')],
  ];

  await safeEditMessage(ctx, text, Markup.inlineKeyboard(buttons));
});

// View Order Details & Purchased Credentials
bot.action(/^view_order_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const orderId = ctx.match[1];
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { variant: { include: { product: true } } },
      },
      review: true,
    },
  });
  if (!order) {
    return;
  }

  const orderItem = order.items?.[0];
  const productName = orderItem?.variant?.product?.name || 'Digital Item';
  const totalAmount = Number(order.totalAmount).toFixed(2);

  let msg =
    `📦 *Order Details*\n\n` +
    `📋 *Order Number:* \`#${order.orderNumber}\` \n` +
    `📦 *Product:* ${productName}\n` +
    `💰 *Total Amount:* *Rs. ${totalAmount} PKR*\n` +
    `📊 *Status:* [${order.orderStatus}]\n` +
    `📅 *Date:* ${new Date(order.createdAt).toLocaleDateString()}\n`;

  if (order.review) {
    const stars = '⭐'.repeat(order.review.rating);
    msg += `⭐ *Your Rating:* ${stars} (${order.review.rating}/5)\n`;
    if (order.review.comment) msg += `💬 *Your Feedback:* "${order.review.comment}"\n`;
  }
  msg += `\n`;

  if ((order.orderStatus === 'COMPLETED' || order.deliveryStatus === 'DELIVERED') && order.deliveryData) {
    try {
      const { decryptData } = await import('../utils/crypto.js');
      const decryptedJson = decryptData(order.deliveryData);
      const items: { content: string }[] = JSON.parse(decryptedJson);
      msg += `🔑 *Purchased Credentials / Keys:*\n\n`;
      items.forEach((item) => {
        msg += `\`\`\`\n${item.content}\n\`\`\`\n`;
      });
    } catch (err) {
      msg += `🔑 Credentials delivered to your chat.`;
    }
  }

  const buttons: any[] = [];

  // If completed and not yet reviewed, offer star rating buttons
  if ((order.orderStatus === 'COMPLETED' || order.deliveryStatus === 'DELIVERED') && !order.review) {
    buttons.push([
      Markup.button.callback('⭐ 1', `rate_order_${order.id}_1`),
      Markup.button.callback('⭐ 2', `rate_order_${order.id}_2`),
      Markup.button.callback('⭐ 3', `rate_order_${order.id}_3`),
      Markup.button.callback('⭐ 4', `rate_order_${order.id}_4`),
      Markup.button.callback('⭐ 5', `rate_order_${order.id}_5`),
    ]);
  }

  buttons.push([
    Markup.button.callback('⬅️ Back to Orders', 'menu_orders'),
    Markup.button.callback('🏠 Home', 'menu_main'),
  ]);

  await safeEditMessage(ctx, msg, Markup.inlineKeyboard(buttons));
});

// Promotions Menu
bot.action('menu_promotions', async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const msg = `🎁 *Active Store Promotions*\n\nNo active promotions available at the moment. Check back soon for discounts!`;
  await safeEditMessage(ctx, msg, getMainMenuKeyboard(ctx.isAdmin));
});

// Support Menu
bot.action('menu_support', async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const helpText =
    `❓ *Store Help & Support*\n\n` +
    `Need assistance with an order, wallet balance, or product inquiry?\n\n` +
    `💬 *Store Admin Support:* *@zoxer19*\n` +
    `🔗 *Direct Link:* [t.me/zoxer19](https://t.me/zoxer19)`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('💬 Contact Support (@zoxer19)', 'https://t.me/zoxer19')],
    [Markup.button.callback('🏠 Home', 'menu_main')],
  ]);

  await safeEditMessage(ctx, helpText, keyboard);
});

// Category Click — Show all Products or Plan Types in Category
bot.action(/^cat_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const categoryId = ctx.match[1];
  const category = await ProductService.getCategoryWithDetails(categoryId);
  if (!category) {
    return;
  }

  const products = category.products || [];

  if (products.length === 0) {
    const msg =
      `🛍 *${category.name}*\n\n` +
      `📁 *Category:* ${category.name}\n` +
      `📊 *Available Products:* 0\n\n` +
      `⚠️ *No active products available in this category at the moment.*\n\n` +
      `📝 *Description:*\n${category.description || 'Check back later for updates!'}`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⬅️ Back to Store Categories', 'menu_store'),
        Markup.button.callback('🏠 Home', 'menu_main'),
      ],
    ]);

    await safeEditMessage(ctx, msg, keyboard);
    return;
  }

  // If there are multiple products/plans in this category (e.g. 20 Days, 1 Year, Plus, etc.)
  if (products.length > 1) {
    const descText = category.description ? `📝 ${category.description}\n\n` : '';
    const msg =
      `🛍 *${category.name} Products*\n\n` +
      `📁 *Category:* ${category.name}\n` +
      descText +
      `📦 *Available Products (${products.length}):*\n` +
      `Select an option below to view details and purchase:`;

    await safeEditMessage(ctx, msg, getProductsKeyboard(products, category.id));
    return;
  }

  // If there is exactly 1 product in this category
  const product = products[0];
  const variants = product.variants || [];
  const desc = product.description || category.description || 'No description provided.';

  if (variants.length === 0) {
    const msg =
      `🛍 *Product Details*\n\n` +
      `📦 *Product:* ${product.name}\n` +
      `📁 *Category:* ${category.name}\n\n` +
      `⚠️ *No packages available for this product currently.*\n\n` +
      `📝 *Description:*\n${desc}`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⬅️ Back to Store Categories', 'menu_store'),
        Markup.button.callback('🏠 Home', 'menu_main'),
      ],
    ]);

    await safeEditMessage(ctx, msg, keyboard);
    return;
  }

  if (variants.length === 1) {
    const variant = variants[0];
    const stockCount = (variant as any)._count?.stockItems ?? 0;
    const priceStr = Number(variant.price).toFixed(2);
    const deliveryStr = variant.deliveryType === 'AUTOMATIC' ? '⚡ Instant Auto Delivery' : '🖐 Manual Delivery';
    const durationStr = variant.duration ? `• *Warranty / Plan Details:* ${variant.duration}\n` : '';
    const planNameStr = variant.name !== 'Standard License' && variant.name !== 'Standard Plan' ? `• *Plan:* ${variant.name}\n` : '';

    const msg =
      `🛍 *Product Details*\n\n` +
      `📦 *Product:* ${product.name}\n` +
      `📁 *Category:* ${category.name}\n` +
      planNameStr +
      durationStr +
      `📊 *Available Items:* ${stockCount}\n` +
      `💰 *Price:* Rs. ${priceStr} PKR\n` +
      `🚀 *Delivery:* ${deliveryStr}\n\n` +
      `📝 *Description:*\n${desc}`;

    const buyButton = stockCount > 0
      ? Markup.button.callback(`💳 Buy Now (Rs. ${priceStr})`, `buy_var_${variant.id}`)
      : Markup.button.callback(`⚠️ Out of Stock (Rs. ${priceStr})`, 'buy_zero_item');

    const keyboard = Markup.inlineKeyboard([
      [buyButton],
      [
        Markup.button.callback('⬅️ Back to Store Categories', 'menu_store'),
        Markup.button.callback('🏠 Home', 'menu_main'),
      ],
    ]);

    await safeEditMessage(ctx, msg, keyboard);
    return;
  }

  // Single product with multiple variants/durations
  const totalStock = variants.reduce((sum: number, v: any) => sum + ((v as any)._count?.stockItems ?? 0), 0);
  const minPrice = Math.min(...variants.map((v: any) => Number(v.price)));

  let plansListText = '';
  variants.forEach((v: any, idx: number) => {
    const vStock = (v as any)._count?.stockItems ?? v.stockCount ?? 0;
    const durationStr = v.duration ? `\n   🛡 *Warranty / Plan:* ${v.duration}` : '';
    const deliveryStr = v.deliveryType === 'AUTOMATIC' ? '⚡ Instant Auto' : '🖐 Manual';
    plansListText += `\n${idx + 1}. *${v.name}* — Rs. ${Number(v.price).toFixed(0)} PKR\n   📦 Stock: ${vStock > 0 ? vStock + ' available' : 'Out of Stock'} | ${deliveryStr}${durationStr}`;
  });

  const msg =
    `🛍 *Product Details*\n\n` +
    `📦 *Product:* ${product.name}\n` +
    `📁 *Category:* ${category.name}\n` +
    `📊 *Total Stock:* ${totalStock}\n` +
    `💰 *Starting from:* Rs. ${minPrice.toFixed(0)} PKR\n\n` +
    `📝 *Description:*\n${desc}\n\n` +
    `📋 *Available Plans & Warranties:*${plansListText}\n\n` +
    `👇 *Select your preferred plan / duration to purchase:*`;

  await safeEditMessage(ctx, msg, getProductVariantsKeyboard(product, variants, 'menu_store'));
});

// Product Click — Show Details with All Variants
bot.action(/^prod_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const productId = ctx.match[1];
  const product = await ProductService.getProductById(productId);
  if (!product) {
    return;
  }

  const categoryName = product.category ? product.category.name : 'Digital Store';
  const variants = product.variants || [];
  const desc = product.description || 'No description provided.';
  const backTarget = product.categoryId ? `cat_${product.categoryId}` : 'menu_store';

  if (variants.length === 0) {
    const msg =
      `🛍 *Product Details*\n\n` +
      `📦 *Product:* ${product.name}\n` +
      `📁 *Category:* ${categoryName}\n\n` +
      `⚠️ *No packages available for this product currently.*\n\n` +
      `📝 *Description:*\n${desc}`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('⬅️ Back to Products', backTarget),
        Markup.button.callback('🏠 Home', 'menu_main'),
      ],
    ]);

    await safeEditMessage(ctx, msg, keyboard);
    return;
  }

  if (variants.length === 1) {
    const variant = variants[0];
    const stockCount = (variant as any)._count?.stockItems ?? 0;
    const priceStr = Number(variant.price).toFixed(2);
    const deliveryStr = variant.deliveryType === 'AUTOMATIC' ? '⚡ Instant Auto Delivery' : '🖐 Manual Delivery';
    const durationStr = variant.duration ? `• *Warranty / Plan Details:* ${variant.duration}\n` : '';
    const planNameStr = variant.name !== 'Standard License' && variant.name !== 'Standard Plan' ? `• *Plan:* ${variant.name}\n` : '';

    const msg =
      `🛍 *Product Details*\n\n` +
      `📦 *Product:* ${product.name}\n` +
      `📁 *Category:* ${categoryName}\n` +
      planNameStr +
      durationStr +
      `📊 *Available Items:* ${stockCount}\n` +
      `💰 *Price:* Rs. ${priceStr} PKR\n` +
      `🚀 *Delivery:* ${deliveryStr}\n\n` +
      `📝 *Description:*\n${desc}`;

    const buyButton = stockCount > 0
      ? Markup.button.callback(`💳 Buy Now (Rs. ${priceStr})`, `buy_var_${variant.id}`)
      : Markup.button.callback(`⚠️ Out of Stock (Rs. ${priceStr})`, 'buy_zero_item');

    const keyboard = Markup.inlineKeyboard([
      [buyButton],
      [
        Markup.button.callback('⬅️ Back to Products', backTarget),
        Markup.button.callback('🏠 Home', 'menu_main'),
      ],
    ]);

    await safeEditMessage(ctx, msg, keyboard);
    return;
  }

  // Multiple variants for product
  const totalStock = variants.reduce((sum: number, v: any) => sum + ((v as any)._count?.stockItems ?? 0), 0);
  const minPrice = Math.min(...variants.map((v: any) => Number(v.price)));

  let plansListText = '';
  variants.forEach((v: any, idx: number) => {
    const vStock = (v as any)._count?.stockItems ?? v.stockCount ?? 0;
    const durationStr = v.duration ? `\n   🛡 *Warranty / Plan:* ${v.duration}` : '';
    const deliveryStr = v.deliveryType === 'AUTOMATIC' ? '⚡ Instant Auto' : '🖐 Manual';
    plansListText += `\n${idx + 1}. *${v.name}* — Rs. ${Number(v.price).toFixed(0)} PKR\n   📦 Stock: ${vStock > 0 ? vStock + ' available' : 'Out of Stock'} | ${deliveryStr}${durationStr}`;
  });

  const msg =
    `🛍 *Product Details*\n\n` +
    `📦 *Product:* ${product.name}\n` +
    `📁 *Category:* ${categoryName}\n` +
    `📊 *Total Stock:* ${totalStock}\n` +
    `💰 *Starting from:* Rs. ${minPrice.toFixed(0)} PKR\n\n` +
    `📝 *Description:*\n${desc}\n\n` +
    `📋 *Available Plans & Warranties:*${plansListText}\n\n` +
    `👇 *Select your preferred plan / duration to purchase:*`;

  await safeEditMessage(ctx, msg, getProductVariantsKeyboard(product, variants, backTarget));
});

// Buy zero item click handler
bot.action('buy_zero_item', async (ctx) => {
  await ctx.answerCbQuery('⚠️ This item is currently out of stock (0 items available).', { show_alert: true }).catch(() => {});
});

// 🛒 Buy Variant Click — Create Order & Show Payment Selection
bot.action(/^buy_var_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const variantId = ctx.match[1];
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  if (!user) return;

  // Check stock first
  const stockCount = await ProductService.getAvailableStockCount(variantId);
  if (stockCount === 0) {
    await ctx.answerCbQuery('⚠️ Selected item is currently out of stock.', { show_alert: true }).catch(() => {});
    return;
  }

  // Prompt user for quantity selection
  if (!ctx.session) ctx.session = {};
  ctx.session.pendingVariantId = variantId;

  // Build quantity keyboard (1-5)
  const qtyButtons = [1, 2, 3, 4, 5].map((q) =>
    Markup.button.callback(`${q}`, `select_qty_${variantId}_${q}`)
  );
  const quantityKeyboard = Markup.inlineKeyboard(
    qtyButtons.map((b) => [b]).concat([[Markup.button.callback('⬅️ Cancel', 'menu_store')]])
  );

  await ctx.reply(`🛒 *Select Quantity*\n\nAvailable: ${stockCount} items.`, {
    parse_mode: 'Markdown',
    reply_markup: quantityKeyboard.reply_markup,
  });
});

// Quantity selection — Create Order with chosen quantity
bot.action(/^select_qty_(.+)_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const matchedVariantId = ctx.match[1];
  const quantity = Number(ctx.match[2]);
  const variantId = ctx.session?.pendingVariantId || matchedVariantId;
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  if (!user) return;

  const stockCount = await ProductService.getAvailableStockCount(variantId);
  if (quantity > stockCount) {
    await ctx.answerCbQuery('⚠️ Selected quantity exceeds available stock.', { show_alert: true }).catch(() => {});
    return;
  }

  const order = await OrderService.createOrder({
    userId: user.id,
    variantId,
    quantity,
  });

  if (!ctx.session) ctx.session = {};
  ctx.session.activeOrderId = order.id;

  const orderItem = (order as any).items?.[0];
  const rawProductName = orderItem?.variant?.product?.name || 'Digital Item';
  const productName = rawProductName.replace(/[_*`\[\]]/g, '\\$&');
  const totalAmount = Number(order.totalAmount).toFixed(2);
  const userBalance = Number(user.balance).toFixed(2);

  const msg = `🛒 *Order Checkout Confirmation*\n\n` +
    `📋 *Order Number:* \`#${order.orderNumber}\` \n` +
    `📦 *Product:* ${productName}\n` +
    `🔢 *Quantity:* ${quantity}\n` +
    `💰 *Total Amount:* *Rs. ${totalAmount} PKR*\n\n` +
    `💳 *Select your payment method below:*`;

  const accounts = await PaymentAccountService.getActiveAccounts();
  const paymentButtons: any[] = [];
  accounts.forEach((acc) => {
    paymentButtons.push([
      Markup.button.callback(`📱 Pay with ${acc.providerName} (${acc.accountNumber})`, `pay_acc_${acc.id}`),
    ]);
  });
  if (paymentButtons.length === 0) {
    paymentButtons.push([
      Markup.button.callback('📱 Pay with JazzCash (03292823218)', `pay_method_jazzcash_${order.id}`),
    ]);
  }
  paymentButtons.push([
    Markup.button.callback(`💰 Pay with Wallet Balance (Rs. ${userBalance})`, `pay_method_wallet_${order.id}`),
  ]);
  paymentButtons.push([
    Markup.button.callback('⬅️ Cancel Order', 'menu_store'),
    Markup.button.callback('🏠 Home', 'menu_main'),
  ]);

  await safeEditMessage(ctx, msg, Markup.inlineKeyboard(paymentButtons));
});

// 📱 Pay via Dynamic Payment Account — Show Payment Instructions
bot.action(/^pay_acc_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const accountId = ctx.match[1];
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  if (!user) return;

  const orderId = ctx.session?.activeOrderId;
  const order = (orderId ? await OrderService.getOrderById(orderId) : null) || (await OrderService.getLatestPendingOrder(user.id));
  if (!order) {
    await ctx.answerCbQuery('Order not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const account = await PaymentAccountService.getAccountById(accountId);
  const providerName = account?.providerName || 'Manual Transfer';
  const accountNumber = account?.accountNumber || '03292823218';
  const accountTitle = account?.accountTitle || 'SARIKH MUREED';
  const instructions =
    account?.instructions ||
    `After completing the transfer, please *reply directly to this chat with your 12-digit Transaction ID (TRX ID)* or send a screenshot of the payment receipt.`;

  if (!ctx.session) ctx.session = {};
  ctx.session.userState = 'AWAITING_PAYMENT_PROOF';
  ctx.session.userData = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: Number(order.totalAmount).toFixed(2),
    providerName,
    accountNumber,
    accountTitle,
  };

  const msg =
    `💳 *${providerName} Payment Instructions*\n\n` +
    `Please transfer the total amount to our ${providerName} account:\n\n` +
    `• *Payment Method:* ${providerName}\n` +
    `• *Account Number / IBAN:* \`${accountNumber}\`\n` +
    `• *Account Title:* \`${accountTitle}\`\n` +
    `• *Amount to Transfer:* *Rs. ${Number(order.totalAmount).toFixed(2)} PKR*\n` +
    `• *Order Number:* \`#${order.orderNumber}\`\n\n` +
    `📌 *Instructions:*\n` +
    `${instructions}`;

  const keyboard = Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'menu_main')]]);

  await safeEditMessage(ctx, msg, keyboard);
});

// Legacy handler support
bot.action(/^pay_method_acc_(.+)_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const accountId = ctx.match[1];
  const orderId = ctx.match[2];

  const order = await OrderService.getOrderById(orderId);
  if (!order) {
    await ctx.answerCbQuery('Order not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const account = await PaymentAccountService.getAccountById(accountId);
  const providerName = account?.providerName || 'Manual Transfer';
  const accountNumber = account?.accountNumber || '03292823218';
  const accountTitle = account?.accountTitle || 'SARIKH MUREED';
  const instructions =
    account?.instructions ||
    `After completing the transfer, please *reply directly to this chat with your 12-digit Transaction ID (TRX ID)* or send a screenshot of the payment receipt.`;

  if (!ctx.session) ctx.session = {};
  ctx.session.userState = 'AWAITING_PAYMENT_PROOF';
  ctx.session.userData = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: Number(order.totalAmount).toFixed(2),
    providerName,
    accountNumber,
    accountTitle,
  };

  const msg =
    `💳 *${providerName} Payment Instructions*\n\n` +
    `Please transfer the total amount to our ${providerName} account:\n\n` +
    `• *Payment Method:* ${providerName}\n` +
    `• *Account Number / IBAN:* \`${accountNumber}\`\n` +
    `• *Account Title:* \`${accountTitle}\`\n` +
    `• *Amount to Transfer:* *Rs. ${Number(order.totalAmount).toFixed(2)} PKR*\n` +
    `• *Order Number:* \`#${order.orderNumber}\`\n\n` +
    `📌 *Instructions:*\n` +
    `${instructions}`;

  const keyboard = Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'menu_main')]]);

  await safeEditMessage(ctx, msg, keyboard);
});

// 📱 Legacy / Direct Pay via JazzCash fallback
bot.action(/^pay_method_jazzcash_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const orderId = ctx.match[1];
  const order = await OrderService.getOrderById(orderId);
  if (!order) {
    await ctx.answerCbQuery('Order not found.').catch(() => {});
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.userState = 'AWAITING_PAYMENT_PROOF';
  ctx.session.userData = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: Number(order.totalAmount).toFixed(2),
    providerName: 'JazzCash',
    accountNumber: '03292823218',
    accountTitle: 'SARIKH MUREED',
  };

  const msg =
    `💳 *JazzCash Payment Instructions*\n\n` +
    `Please transfer the total amount to our JazzCash account:\n\n` +
    `• *Payment Method:* JazzCash\n` +
    `• *Account Number:* \`03292823218\`\n` +
    `• *Account Title:* \`SARIKH MUREED\`\n` +
    `• *Amount to Transfer:* *Rs. ${Number(order.totalAmount).toFixed(2)} PKR*\n` +
    `• *Order Number:* \`#${order.orderNumber}\`\n\n` +
    `📌 *Instructions:*\n` +
    `After completing the transfer, please *reply directly to this chat with your 12-digit JazzCash Transaction ID (TRX ID)* or send a screenshot of the payment receipt.`;

  const keyboard = Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'menu_main')]]);

  await safeEditMessage(ctx, msg, keyboard);
});

// 💰 Pay via Wallet Balance
bot.action(/^pay_method_wallet_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(() => {});
  const orderId = ctx.match[1];
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  if (!user) return;

  const order = await OrderService.getOrderById(orderId);
  if (!order) {
    await ctx.answerCbQuery('Order not found.').catch(() => {});
    return;
  }

  const walletProvider = new WalletPaymentProvider();
  const idempotencyKey = `WALLET_${order.id}_${Date.now()}`;

  try {
    const result = await walletProvider.createPayment(
      order.id,
      user.id,
      Number(order.totalAmount),
      order.currency,
      idempotencyKey
    );

    if (result.status === 'PAID') {
      await ctx.answerCbQuery('✅ Wallet Payment Successful!').catch(() => {});
      // Dispatch delivery immediately
      await DeliveryService.processOrderDelivery(order.id, bot);
    }
  } catch (err: any) {
    await ctx.answerCbQuery(`⚠️ ${err.message || 'Payment failed'}`, { show_alert: true }).catch(() => {});
  }
});

// ⭐ Customer 1-5 Star Rating Action (Delivered Orders Only)
bot.action(/^rate_order_([a-zA-Z0-9-]+)_([1-5])$/, async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const orderId = ctx.match[1];
  const rating = parseInt(ctx.match[2], 10);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { variant: { include: { product: true } } },
      },
      review: true,
      user: true,
    },
  });

  if (!order) {
    await ctx.answerCbQuery('Order not found.', { show_alert: true }).catch(() => {});
    return;
  }

  // Ensure this order was delivered before allowing review
  if (order.deliveryStatus !== 'DELIVERED' && order.orderStatus !== 'COMPLETED') {
    await ctx.answerCbQuery('⚠️ Reviews can only be submitted after your order is successfully delivered.', { show_alert: true }).catch(() => {});
    return;
  }

  // Ensure user owns this order
  if (order.user.telegramId !== BigInt(ctx.from.id)) {
    await ctx.answerCbQuery('Unauthorized.', { show_alert: true }).catch(() => {});
    return;
  }

  const productId = order.items[0]?.variant?.productId;
  if (!productId) {
    await ctx.answerCbQuery('Product info not found.', { show_alert: true }).catch(() => {});
    return;
  }

  const existingReview = order.review;
  if (existingReview) {
    await prisma.review.update({
      where: { id: existingReview.id },
      data: { rating, isApproved: true },
    });
  } else {
    await ReviewService.createReview(order.id, productId, order.userId, rating);
  }

  const starsStr = '⭐'.repeat(rating);
  const productName = order.items[0]?.variant?.product?.name || 'Product';

  if (!ctx.session) ctx.session = {};
  ctx.session.userState = 'AWAITING_REVIEW_COMMENT';
  ctx.session.userData = { orderId: order.id, rating, productName };

  const promptMsg =
    `🌟 *Thank you for rating ${productName}!* ${starsStr} (${rating}/5)\n\n` +
    `💬 *Would you like to write a short review or feedback?*\n` +
    `Simply reply to this message with your comments, or press *Skip* below:`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⏭ Skip (Save Rating Only)', 'review_skip_comment')],
    [Markup.button.callback('🏠 Return to Store', 'menu_main')],
  ]);

  await ctx.reply(promptMsg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup,
  });
});

// ⏭ Customer Skips Writing Review Comment
bot.action('review_skip_comment', async (ctx) => {
  await ctx.answerCbQuery('Rating saved! Thank you.').catch(() => {});
  if (ctx.session) {
    ctx.session.userState = undefined;
    ctx.session.userData = undefined;
  }
  await ctx.reply('✅ *Your review has been saved! Thank you for your feedback!*', {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
  });
});

// 📩 User Payment Proof Listener & Review Comment Listener
bot.on(['text', 'photo'], async (ctx, next) => {
  if (ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/')) {
    if (ctx.session) {
      ctx.session.userState = undefined;
      ctx.session.userData = undefined;
    }
    return next();
  }

  // 📝 Customer Review Comment Input
  if (ctx.session?.userState === 'AWAITING_REVIEW_COMMENT' && ctx.session?.userData?.orderId) {
    const { orderId, rating, productName } = ctx.session.userData;
    const commentText = ctx.message && 'text' in ctx.message ? ctx.message.text.trim() : '';

    if (commentText) {
      await prisma.review.update({
        where: { orderId },
        data: { comment: commentText },
      }).catch(() => {});
    }

    ctx.session.userState = undefined;
    ctx.session.userData = undefined;

    const starsStr = '⭐'.repeat(rating || 5);
    await ctx.reply(
      `🎉 *Review Submitted Successfully!*\n\n` +
      `• *Product:* ${productName}\n` +
      `• *Rating:* ${starsStr} (${rating}/5)\n` +
      (commentText ? `• *Feedback:* "${commentText}"\n\n` : '\n') +
      `Thank you for helping us improve our service!`,
      {
        parse_mode: 'Markdown',
        reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
      }
    );
    return;
  }

  if (ctx.session?.userState === 'AWAITING_PAYMENT_PROOF' && ctx.session?.userData?.orderId) {
    const { orderId, orderNumber, amount } = ctx.session.userData;
    const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
    if (!user) return next();

    let trxRef = 'Screenshot Receipt';
    let proofFileId: string | undefined = undefined;

    if (ctx.message && 'text' in ctx.message) {
      trxRef = ctx.message.text.trim();
    } else if (ctx.message && 'photo' in ctx.message && ctx.message.photo.length > 0) {
      const highestRes = ctx.message.photo[ctx.message.photo.length - 1];
      proofFileId = highestRes.file_id;
      if (ctx.message.caption) {
        trxRef = ctx.message.caption.trim();
      }
    }

    const manualProvider = new ManualPaymentProvider();
    const idempotencyKey = `MANUAL_${orderId}_${Date.now()}`;

    const paymentResult = await manualProvider.createPayment(
      orderId,
      user.id,
      parseFloat(amount),
      'PKR',
      idempotencyKey,
      { transactionReference: trxRef, proofFileId }
    );

    ctx.session.userState = undefined;
    ctx.session.userData = undefined;

    // Send confirmation to customer
    await ctx.reply(
      `✅ *Payment Proof Submitted Successfully!*\n\n` +
      `📋 *Order Number:* \`#${orderNumber}\`\n` +
      `💳 *Reference/TRX:* \`${trxRef}\` \n\n` +
      `Store admin (*@zoxer19*) is verifying your payment. Your digital credentials will be delivered here as soon as approved!`,
      {
        parse_mode: 'Markdown',
        reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
      }
    );

    const adminIds = config.ADMIN_IDS;
    const providerStr = ctx.session.userData?.providerName || 'Manual Transfer';
    const accNumberStr = ctx.session.userData?.accountNumber || '';
    const accTitleStr = ctx.session.userData?.accountTitle || '';

    const adminMsg =
      `💳 *New Payment Proof Received!*\n\n` +
      `• *Order Number:* \`#${orderNumber}\` \n` +
      `• *Customer:* ${user.username ? '@' + user.username : user.firstName || user.id} (ID: \`${user.telegramId.toString()}\`)\n` +
      `• *Amount:* *Rs. ${amount} PKR*\n` +
      `• *Method:* ${providerStr} ${accNumberStr ? `(\`${accNumberStr}\` - \`${accTitleStr}\`)` : ''}\n` +
      `• *TRX Proof:* \`${trxRef}\``;

    const adminKeyboard = getPaymentReviewKeyboard(paymentResult.paymentId);

    for (const adminId of adminIds) {
      try {
        if (proofFileId) {
          await bot.telegram.sendPhoto(adminId, proofFileId, {
            caption: adminMsg,
            parse_mode: 'Markdown',
            reply_markup: adminKeyboard.reply_markup,
          });
        } else {
          await bot.telegram.sendMessage(adminId, adminMsg, {
            parse_mode: 'Markdown',
            reply_markup: adminKeyboard.reply_markup,
          });
        }
      } catch (adminErr) {
        logger.warn('Failed to send payment alert to admin', { adminId, adminErr });
      }
    }

    return;
  }

  return next();
});
export async function startBot() {
  await connectDatabase();
  await PaymentAccountService.seedDefaultIfEmpty();

  const botInfo = await bot.telegram.getMe();
  bot.botInfo = botInfo;

  if (config.BOT_MODE === 'webhook' && config.WEBHOOK_URL) {
    logger.info(`Starting bot in WEBHOOK mode at ${config.WEBHOOK_URL}`);
    await bot.telegram.setWebhook(config.WEBHOOK_URL).catch((err) => {
      logger.error('Webhook configuration error', { error: err.message });
    });
    logger.info(`✅ Bot webhook set successfully for @${botInfo.username}`);
  } else {
    logger.info('Starting bot in LONG POLLING mode...');
    await bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
    
    logger.info(`✅ Bot launched successfully as @${botInfo.username}`);
    bot.launch({ dropPendingUpdates: false }).catch((err) => {
      logger.error('Bot runtime error', { error: err.message });
    });
  }
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Auto-start bot on execution only in standalone / non-serverless mode
if (
  !process.env.VERCEL &&
  !process.env.SERVERLESS &&
  !process.env.AWS_LAMBDA_FUNCTION_NAME &&
  process.env.NODE_ENV !== 'test'
) {
  startBot().catch((err) => {
    logger.error('Fatal error during bot initialization', { err });
  });
}


