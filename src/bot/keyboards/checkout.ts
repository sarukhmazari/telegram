import { Markup } from 'telegraf';
import { Order } from '@prisma/client';

export function getOrderConfirmationKeyboard(orderId: string, hasCoupon: boolean = false) {
  const buttons: any[] = [];

  buttons.push([Markup.button.callback('💳 Pay Now', `pay_order_${orderId}`)]);

  if (!hasCoupon) {
    buttons.push([Markup.button.callback('🎟 Apply Coupon Code', `coupon_order_${orderId}`)]);
  }

  buttons.push([
    Markup.button.callback('❌ Cancel Order', `cancel_order_${orderId}`),
    Markup.button.callback('🏠 Home', 'menu_main'),
  ]);

  return Markup.inlineKeyboard(buttons);
}

export function getPaymentMethodKeyboard(orderId: string, isWalletEnabled: boolean = true) {
  const buttons: any[] = [];

  if (isWalletEnabled) {
    buttons.push([Markup.button.callback('💰 Pay with Wallet Balance', `pay_method_wallet_${orderId}`)]);
  }

  buttons.push([
    Markup.button.callback('🏦 Bank Transfer / JazzCash / EasyPaisa', `pay_method_manual_${orderId}`),
  ]);

  buttons.push([
    Markup.button.callback('⚡ Telegram Payments / Invoice', `pay_method_telegram_${orderId}`),
  ]);

  buttons.push([
    Markup.button.callback('⬅️ Back to Order', `view_order_${orderId}`),
    Markup.button.callback('🏠 Home', 'menu_main'),
  ]);

  return Markup.inlineKeyboard(buttons);
}
