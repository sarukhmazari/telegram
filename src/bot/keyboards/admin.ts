import { Markup } from 'telegraf';

export function getAdminMainKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Dashboard', 'admin_dashboard'), Markup.button.callback('📦 Products', 'admin_products')],
    [Markup.button.callback('🗂 Categories', 'admin_categories'), Markup.button.callback('📦 Stock', 'admin_stock')],
    [Markup.button.callback('📋 Orders', 'admin_orders'), Markup.button.callback('💳 Payments', 'admin_payments')],
    [Markup.button.callback('👥 Users', 'admin_users'), Markup.button.callback('🎟 Coupons', 'admin_coupons')],
    [Markup.button.callback('📢 Broadcast', 'admin_broadcast'), Markup.button.callback('⭐ Reviews', 'admin_reviews')],
    [Markup.button.callback('🏠 Customer Store View', 'menu_main')],
  ]);
}

export function getAdminProductsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Add New Product', 'admin_add_product')],
    [Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')],
  ]);
}

export function getAdminCategoriesKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Add New Category', 'admin_add_category')],
    [Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')],
  ]);
}

export function getPaymentReviewKeyboard(paymentId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Approve Payment', `admin_approve_pay_${paymentId}`),
      Markup.button.callback('❌ Reject Payment', `admin_reject_pay_${paymentId}`),
    ],
    [Markup.button.callback('⬅️ Back to Payments', 'admin_payments')],
  ]);
}
