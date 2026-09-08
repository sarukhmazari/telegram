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
import { getPaymentReviewKeyboard } from './keyboards/admin.js';

import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Auto-detect local proxy (only if environment variable HTTPS_PROXY / https_proxy is defined)
const systemProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const agent = systemProxy ? new HttpsProxyAgent(systemProxy) : undefined;

export const bot = new Telegraf<BotContext>(config.BOT_TOKEN, {
  telegram: agent ? { agent } : undefined,
});

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
  const userDisplay = ctx.from?.username
    ? `@${ctx.from.username}`
    : (ctx.from?.first_name || `User`);
  const userId = ctx.from?.id ? ` (ID: \`${ctx.from.id}\`)` : '';

  const welcomeText =
    `👋 *Welcome, ${userDisplay}!*${userId}\n\n` +
    `Welcome to *${config.STORE_NAME}*!\n\n` +
    `Explore our catalog of digital products, premium accounts, software licenses, and subscription plans.\n\n` +
    `Select an option below to get started:`;

  await ctx.reply(welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
  });
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
  const msg = `💰 *Your Wallet Balance*\n\nCurrent Balance: *$${balance} ${config.STORE_CURRENCY}*\n\nYou can use your wallet balance for instant payments at checkout.`;
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
    msg += `• Order #${o.orderNumber} - *$${Number(o.totalAmount).toFixed(2)}* [${o.orderStatus}]\n`;
  });
  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
  });
});

bot.command('help', async (ctx) => {
  const helpText = `❓ *Store Help & Support*\n\nUse the menu buttons below to browse products, check your wallet balance, or view past orders.\n\nNeed assistance? Contact support username: @${config.SUPPORT_USERNAME}`;
  await ctx.reply(helpText, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
  });
});

// /shop or Store button
bot.action('menu_store', async (ctx) => {
  const categories = await ProductService.getActiveCategories();
  if (categories.length === 0) {
    await ctx.answerCbQuery('No active categories available at the moment.').catch(() => {});
    return;
  }

  await ctx.editMessageText('🛍 *Select a Product Category:*', {
    parse_mode: 'Markdown',
    reply_markup: getCategoriesKeyboard(categories).reply_markup,
  }).catch((err) => {
    if (!String(err).includes('message is not modified')) logger.warn('menu_store edit error', { err });
  });
});

// Main menu callback
bot.action('menu_main', async (ctx) => {
  const userDisplay = ctx.from?.username
    ? `@${ctx.from.username}`
    : (ctx.from?.first_name || `User`);
  const userId = ctx.from?.id ? ` (ID: \`${ctx.from.id}\`)` : '';

  await ctx.editMessageText(`🏠 *Main Menu*\n\nWelcome back, *${userDisplay}*!${userId}\n\nWelcome to *${config.STORE_NAME}*!`, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
  }).catch((err) => {
    if (!String(err).includes('message is not modified')) logger.warn('menu_main edit error', { err });
  });
});

// Balance Menu
bot.action('menu_balance', async (ctx) => {
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  const balance = Number(user?.balance || 0).toFixed(2);
  const msg =
    `💰 *Your Wallet Balance*\n\n` +
    `Current Balance: *$${balance} ${config.STORE_CURRENCY}*\n\n` +
    `You can use your wallet balance for instant payments at checkout.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💳 Deposit / Top-up Balance', 'menu_deposit')],
    [Markup.button.callback('🏠 Home', 'menu_main')],
  ]);

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup,
  }).catch((err) => {
    if (!String(err).includes('message is not modified')) logger.warn('menu_balance edit error', { err });
  });
});

// Deposit / Top-up Balance Action
bot.action('menu_deposit', async (ctx) => {
  const msg =
    `💳 *Wallet Balance Top-up*\n\n` +
    `To add funds to your wallet balance, please contact store support or send manual payment proof:\n\n` +
    `• *Support Handle:* @${config.SUPPORT_USERNAME}\n` +
    `• *Accepted Payment Methods:* Binance Pay, USDT TRC20, Bank Transfer, EasyPaisa, JazzCash.\n\n` +
    `Send your transfer reference or screenshot to @${config.SUPPORT_USERNAME} to credit your account balance instantly.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Back to Balance', 'menu_balance')],
    [Markup.button.callback('🏠 Home', 'menu_main')],
  ]);

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup,
  }).catch((err) => {
    if (!String(err).includes('message is not modified')) logger.warn('menu_deposit edit error', { err });
  });
});

// Account Menu
bot.action('menu_account', async (ctx) => {
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  if (!user) return;

  const msg =
    `👤 *My Account Profile*\n\n` +
    `User ID: \`${user.telegramId.toString()}\` \n` +
    `Username: ${user.username ? '@' + user.username : 'N/A'}\n` +
    `Wallet Balance: *$${Number(user.balance).toFixed(2)}*\n` +
    `Referral Code: \`${user.referralCode}\` \n\n` +
    `Share your referral link to earn rewards:\n` +
    `\`https://t.me/${ctx.botInfo?.username || 'Bot'}?start=${user.referralCode}\``;

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
  }).catch((err) => {
    if (!String(err).includes('message is not modified')) logger.warn('menu_account edit error', { err });
  });
});

// My Orders Menu
bot.action('menu_orders', async (ctx) => {
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  if (!user) return;

  const orders = await OrderService.getUserOrders(user.id);
  
  if (orders.length === 0) {
    await ctx.editMessageText('📦 *Your Order History*\n\nYou have no past orders yet.', {
      parse_mode: 'Markdown',
      reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
    }).catch((err) => {
      if (!String(err).includes('message is not modified')) logger.warn('menu_orders edit error', { err });
    });
    return;
  }

  let msg = `📦 *Your Order History*\n\nSelect an order below to view credentials & details:\n\n`;
  const buttons: any[] = [];
  orders.forEach((o) => {
    msg += `• Order #${o.orderNumber} — *$${Number(o.totalAmount).toFixed(2)}* [${o.orderStatus}]\n`;
    buttons.push([Markup.button.callback(`📋 #${o.orderNumber} ($${Number(o.totalAmount).toFixed(2)})`, `view_order_${o.id}`)]);
  });
  buttons.push([Markup.button.callback('🏠 Home', 'menu_main')]);

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
  }).catch((err) => {
    if (!String(err).includes('message is not modified')) logger.warn('menu_orders edit error', { err });
  });
});

// View Order Details & Purchased Credentials
bot.action(/^view_order_(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  const order = await OrderService.getOrderById(orderId);
  if (!order) {
    await ctx.answerCbQuery('Order not found.');
    return;
  }

  const orderItem = order.items?.[0];
  const productName = orderItem?.variant?.product?.name || 'Digital Item';
  const totalAmount = Number(order.totalAmount).toFixed(2);

  let msg =
    `📦 *Order Details*\n\n` +
    `📋 *Order Number:* \`#${order.orderNumber}\` \n` +
    `📦 *Product:* ${productName}\n` +
    `💰 *Total Amount:* *$${totalAmount} USD*\n` +
    `📊 *Status:* [${order.orderStatus}]\n` +
    `📅 *Date:* ${new Date(order.createdAt).toLocaleDateString()}\n\n`;

  if (order.orderStatus === 'COMPLETED' && order.deliveryData) {
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

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Back to Orders', 'menu_orders'), Markup.button.callback('🏠 Home', 'menu_main')],
  ]);

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup,
  }).catch(() => {
    ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup }).catch(() => {});
  });
});

// Promotions Menu
bot.action('menu_promotions', async (ctx) => {
  const msg = `🎁 *Active Store Promotions*\n\nNo active promotions available at the moment. Check back soon for discounts!`;
  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: getMainMenuKeyboard(ctx.isAdmin).reply_markup,
  }).catch((err) => {
    if (!String(err).includes('message is not modified')) logger.warn('menu_promotions edit error', { err });
  });
});

// Support Menu
bot.action('menu_support', async (ctx) => {
  const helpText =
    `❓ *Store Help & Support*\n\n` +
    `Need assistance with an order, wallet balance, or product inquiry?\n\n` +
    `💬 *Store Admin Support:* *@zoxer19*\n` +
    `🔗 *Direct Link:* [t.me/zoxer19](https://t.me/zoxer19)`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('💬 Contact Support (@zoxer19)', 'https://t.me/zoxer19')],
    [Markup.button.callback('🏠 Home', 'menu_main')],
  ]);

  await ctx.editMessageText(helpText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup,
  }).catch((err) => {
    if (!String(err).includes('message is not modified')) logger.warn('menu_support edit error', { err });
  });
});

// Category Click — Show Product Details with Live Price & Live Stock Count
bot.action(/^cat_(.+)$/, async (ctx) => {
  const categoryId = ctx.match[1];
  const category = await ProductService.getCategoryById(categoryId);
  if (!category) {
    await ctx.answerCbQuery('Category not found.');
    return;
  }

  const products = await ProductService.getProductsByCategory(categoryId);

  if (products.length === 0) {
    const msg =
      `🛍 *Product Details*\n\n` +
      `📦 *Product:* ${category.name}\n` +
      `📁 *Category:* ${category.name}\n` +
      `📊 *Available Items:* 0\n` +
      `💰 *Price:* $0.00 USD\n\n` +
      `📝 *Description:*\n${category.description || 'No description provided for this product.'}`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⚠️ Out of Stock ($0.00)', 'buy_zero_item')],
      [
        Markup.button.callback('⬅️ Back to Store Categories', 'menu_store'),
        Markup.button.callback('🏠 Home', 'menu_main'),
      ],
    ]);

    await ctx.editMessageText(msg, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup,
    });
    return;
  }

  const mainProduct = await ProductService.getProductById(products[0].id);
  const rawProductName = mainProduct ? mainProduct.name : category.name;
  const description = mainProduct ? mainProduct.description : (category.description || 'No description provided.');

  let priceStr = '0.00';
  let stockCount = 0;
  let variantId = '';

  if (mainProduct && mainProduct.variants.length > 0) {
    const variant = mainProduct.variants[0];
    variantId = variant.id;
    priceStr = Number(variant.price).toFixed(2);
    stockCount = await ProductService.getAvailableStockCount(variant.id);
  }

  const msg =
    `🛍 *Product Details*\n\n` +
    `📦 *Product:* ${rawProductName}\n` +
    `📁 *Category:* ${category.name}\n` +
    `📊 *Available Items:* ${stockCount}\n` +
    `💰 *Price:* $${priceStr} USD\n\n` +
    `📝 *Description:*\n${description}`;

  const buyButton = stockCount > 0
    ? Markup.button.callback(`💳 Buy Now ($${priceStr})`, `buy_var_${variantId}`)
    : Markup.button.callback(`⚠️ Out of Stock ($${priceStr})`, 'buy_zero_item');

  const keyboard = Markup.inlineKeyboard([
    [buyButton],
    [
      Markup.button.callback('⬅️ Back to Store Categories', 'menu_store'),
      Markup.button.callback('🏠 Home', 'menu_main'),
    ],
  ]);

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup,
  });
});

// Product Click — Show Details
bot.action(/^prod_(.+)$/, async (ctx) => {
  const productId = ctx.match[1];
  const product = await ProductService.getProductById(productId);
  if (!product) {
    await ctx.answerCbQuery('Product not found.');
    return;
  }

  const categoryName = product.category ? product.category.name : 'Digital Store';
  let priceStr = '0.00';
  let stockCount = 0;
  let variantId = '';

  if (product.variants.length > 0) {
    const variant = product.variants[0];
    variantId = variant.id;
    priceStr = Number(variant.price).toFixed(2);
    stockCount = await ProductService.getAvailableStockCount(variant.id);
  }

  const msg =
    `🛍 *Product Details*\n\n` +
    `📦 *Product:* ${product.name}\n` +
    `📁 *Category:* ${categoryName}\n` +
    `📊 *Available Items:* ${stockCount}\n` +
    `💰 *Price:* $${priceStr} USD\n\n` +
    `📝 *Description:*\n${product.description || 'No description provided.'}`;

  const buyButton = stockCount > 0
    ? Markup.button.callback(`💳 Buy Now ($${priceStr})`, `buy_var_${variantId}`)
    : Markup.button.callback(`⚠️ Out of Stock ($${priceStr})`, 'buy_zero_item');

  const keyboard = Markup.inlineKeyboard([
    [buyButton],
    [
      Markup.button.callback('⬅️ Back to Store Categories', 'menu_store'),
      Markup.button.callback('🏠 Home', 'menu_main'),
    ],
  ]);

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup,
  });
});

// Buy zero item click handler
bot.action('buy_zero_item', async (ctx) => {
  await ctx.answerCbQuery('⚠️ This item is currently out of stock (0 items available).', { show_alert: true });
});

// 🛒 Buy Variant Click — Create Order & Show Payment Selection
bot.action(/^buy_var_(.+)$/, async (ctx) => {
  const variantId = ctx.match[1];
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  if (!user) return;

  // Check stock first
  const stockCount = await ProductService.getAvailableStockCount(variantId);
  if (stockCount === 0) {
    await ctx.answerCbQuery('⚠️ Selected item is currently out of stock.', { show_alert: true });
    return;
  }

  // Create order
  const order = await OrderService.createOrder({
    userId: user.id,
    variantId,
    quantity: 1,
  });

  const orderItem = (order as any).items?.[0];
  const productName = orderItem?.variant?.product?.name || 'Digital Item';
  const totalAmount = Number(order.totalAmount).toFixed(2);
  const userBalance = Number(user.balance).toFixed(2);

  const msg =
    `🛒 *Order Checkout Confirmation*\n\n` +
    `📋 *Order Number:* \`#${order.orderNumber}\` \n` +
    `📦 *Product:* ${productName}\n` +
    `🔢 *Quantity:* 1\n` +
    `💰 *Total Amount:* *$${totalAmount} USD*\n\n` +
    `💳 *Select your payment method below:*`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📱 Pay with JazzCash (03292823218)', `pay_method_jazzcash_${order.id}`)],
    [Markup.button.callback(`💰 Pay with Wallet Balance ($${userBalance})`, `pay_method_wallet_${order.id}`)],
    [
      Markup.button.callback('⬅️ Cancel Order', 'menu_store'),
      Markup.button.callback('🏠 Home', 'menu_main'),
    ],
  ]);

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup,
  });
});

// 📱 Pay via JazzCash — Show Payment Instructions
bot.action(/^pay_method_jazzcash_(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  const order = await OrderService.getOrderById(orderId);
  if (!order) {
    await ctx.answerCbQuery('Order not found.');
    return;
  }

  if (!ctx.session) ctx.session = {};
  ctx.session.userState = 'AWAITING_PAYMENT_PROOF';
  ctx.session.userData = { orderId: order.id, orderNumber: order.orderNumber, amount: Number(order.totalAmount).toFixed(2) };

  const msg =
    `💳 *JazzCash Payment Instructions*\n\n` +
    `Please transfer the total amount to our JazzCash account:\n\n` +
    `• *Payment Method:* JazzCash\n` +
    `• *Account Number:* \`03292823218\`\n` +
    `• *Account Title:* \`SARIKH MUREED\`\n` +
    `• *Amount to Transfer:* *$${Number(order.totalAmount).toFixed(2)} USD*\n` +
    `• *Order Number:* \`#${order.orderNumber}\`\n\n` +
    `📌 *Instructions:*\n` +
    `After completing the transfer, please *reply directly to this chat with your 12-digit JazzCash Transaction ID (TRX ID)* or send a screenshot of the payment receipt.`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('❌ Cancel', 'menu_main')],
  ]);

  await ctx.editMessageText(msg, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup,
  });
});

// 💰 Pay via Wallet Balance
bot.action(/^pay_method_wallet_(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  const user = ctx.dbUser || (ctx.from ? await UserService.getUserByTelegramId(ctx.from.id) : null);
  if (!user) return;

  const order = await OrderService.getOrderById(orderId);
  if (!order) {
    await ctx.answerCbQuery('Order not found.');
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
      await ctx.answerCbQuery('✅ Wallet Payment Successful!');
      // Dispatch delivery immediately
      await DeliveryService.processOrderDelivery(order.id, bot);
    }
  } catch (err: any) {
    await ctx.answerCbQuery(`⚠️ ${err.message || 'Payment failed'}`, { show_alert: true });
  }
});

// 📩 User Payment Proof Listener (Text TRX ID or Photo Screenshot)
bot.on(['text', 'photo'], async (ctx, next) => {
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
      'USD',
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

    // Notify Admin with 1-click Approve / Reject buttons
    const adminIds = config.ADMIN_IDS;
    const adminMsg =
      `💳 *New Payment Proof Received!*\n\n` +
      `• *Order Number:* \`#${orderNumber}\` \n` +
      `• *Customer:* ${user.username ? '@' + user.username : user.firstName || user.id} (ID: \`${user.telegramId.toString()}\`)\n` +
      `• *Amount:* *$${amount} USD*\n` +
      `• *Method:* JazzCash (\`03292823218\` - \`SARIKH MUREED\`)\n` +
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

  if (config.BOT_MODE === 'webhook' && config.WEBHOOK_URL) {
    logger.info(`Starting bot in WEBHOOK mode at ${config.WEBHOOK_URL}`);
    await bot.telegram.setWebhook(config.WEBHOOK_URL).catch((err) => {
      logger.error('Webhook configuration error', { error: err.message });
    });
  } else {
    logger.info('Starting bot in LONG POLLING mode...');
    await bot.telegram.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
    
    await bot.launch().then(() => {
      logger.info(`✅ Bot launched successfully as @${bot.botInfo?.username}`);
    }).catch((err) => {
      logger.error('Bot launch error', { error: err.message });
    });
  }
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Auto-start bot on execution only in standalone / non-serverless mode
if (!process.env.VERCEL && !process.env.SERVERLESS) {
  startBot().catch((err) => {
    logger.error('Fatal error during bot initialization', { err });
  });
}

