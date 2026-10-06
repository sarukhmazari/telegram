import { Markup } from 'telegraf';
import { PaymentAccount, User, Category, Product, ProductVariant } from '@prisma/client';

export function getAdminMainKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Dashboard', 'admin_dashboard'), Markup.button.callback('📦 Products', 'admin_products')],
    [Markup.button.callback('🗂 Categories', 'admin_categories'), Markup.button.callback('📦 Stock', 'admin_stock')],
    [Markup.button.callback('📋 Orders', 'admin_orders'), Markup.button.callback('💳 Payments', 'admin_payments')],
    [Markup.button.callback('💳 Payment Accounts', 'admin_payment_accounts'), Markup.button.callback('🛡 Staff & Roles', 'admin_roles')],
    [Markup.button.callback('👥 Users', 'admin_users'), Markup.button.callback('🎟 Coupons', 'admin_coupons')],
    [Markup.button.callback('📢 Broadcast', 'admin_broadcast'), Markup.button.callback('⭐ Reviews', 'admin_reviews')],
    [Markup.button.callback('🤖 Bot Settings', 'admin_bot_settings')],
    [Markup.button.callback('🏠 Customer Store View', 'menu_main')],
  ]);
}

export function getBotSettingsKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📛 Change Bot Name', 'admin_change_name')],
    [Markup.button.callback('💬 Change Bio / About', 'admin_change_short_desc')],
    [Markup.button.callback('📝 Change Description Text', 'admin_change_description')],
    [Markup.button.callback('🎧 Change Support Handle', 'admin_change_support')],
    [Markup.button.callback('🌆 Change In-Chat Store Banner', 'admin_change_banner')],
    [Markup.button.callback('🖼 Intro / Description Banner Photo', 'admin_change_desc_photo')],
    [Markup.button.callback('👤 Change Profile Avatar Photo', 'admin_change_photo')],
    [Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')],
  ]);
}

export function getPaymentAccountsKeyboard(accounts: PaymentAccount[]) {
  const buttons: any[] = [];

  accounts.forEach((acc) => {
    const statusIcon = acc.isEnabled ? '✅' : '⏸';
    buttons.push([
      Markup.button.callback(
        `${statusIcon} ${acc.providerName} (${acc.accountNumber})`,
        `admin_payacc_view_${acc.id}`
      ),
    ]);
  });

  buttons.push([Markup.button.callback('➕ Add Payment Method', 'admin_payacc_add')]);
  buttons.push([Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]);

  return Markup.inlineKeyboard(buttons);
}

export function getPaymentAccountDetailKeyboard(account: PaymentAccount) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✏️ Edit Number', `admin_payacc_edit_num_${account.id}`),
      Markup.button.callback('🏷 Edit Title', `admin_payacc_edit_title_${account.id}`),
    ],
    [
      Markup.button.callback('📝 Edit Instructions', `admin_payacc_edit_instr_${account.id}`),
      Markup.button.callback(
        account.isEnabled ? '⏸ Disable' : '✅ Enable',
        `admin_payacc_toggle_${account.id}`
      ),
    ],
    [Markup.button.callback('🗑 Delete Account', `admin_payacc_delete_${account.id}`)],
    [Markup.button.callback('⬅️ Back to Payment Accounts', 'admin_payment_accounts')],
  ]);
}

export function getRolesManagementKeyboard(staffUsers: User[]) {
  const buttons: any[] = [];

  staffUsers.forEach((u) => {
    const icon = u.role === 'OWNER' ? '👑' : '🛡';
    const nameStr = u.username ? `@${u.username}` : (u.firstName || u.telegramId.toString());
    buttons.push([
      Markup.button.callback(`${icon} ${nameStr} [${u.role}]`, `admin_roles_view_${u.id}`),
    ]);
  });

  buttons.push([Markup.button.callback('📋 View Full Staff List', 'admin_roles_list')]);
  buttons.push([Markup.button.callback('➕ Add / Change User Role', 'admin_roles_add')]);
  buttons.push([Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]);

  return Markup.inlineKeyboard(buttons);
}

export function getRoleAssignmentKeyboard(targetUserId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👑 Make Owner', `admin_roles_set_OWNER_${targetUserId}`)],
    [Markup.button.callback('🛡 Make Admin', `admin_roles_set_ADMIN_${targetUserId}`)],
    [Markup.button.callback('👤 Demote to Customer', `admin_roles_set_USER_${targetUserId}`)],
    [Markup.button.callback('⬅️ Back to Staff Management', 'admin_roles')],
  ]);
}

/**
 * Keyboard shown when the user wasn't in the DB yet — pre-authorize them by @username or ID query.
 * Uses hex encoding to keep callback data URL-safe and within Telegram's 64-byte limit.
 */
export function getPreAuthRoleKeyboard(rawQuery: string) {
  // Hex-encode to avoid special chars (+, /, =) in callback data
  const encoded = Buffer.from(rawQuery.slice(0, 20)).toString('hex'); // max 20 chars → 40 hex chars, safely under 64-byte limit
  return Markup.inlineKeyboard([
    [Markup.button.callback('👑 Pre-authorize as Owner', `admin_preauth_OWNER_${encoded}`)],
    [Markup.button.callback('🛡 Pre-authorize as Admin', `admin_preauth_ADMIN_${encoded}`)],
    [Markup.button.callback('❌ Cancel', 'admin_roles')],
  ]);
}

export function getAdminProductsKeyboard(products?: any[]) {
  const buttons: any[] = [];
  if (products && products.length > 0) {
    products.forEach((p) => {
      const statusIcon = p.status === 'ACTIVE' ? '✅' : '⏸';
      const price = p.variants?.[0]?.price ? ` (Rs. ${Number(p.variants[0].price).toFixed(0)})` : '';
      buttons.push([
        Markup.button.callback(`${statusIcon} ${p.name}${price}`, `admin_prod_view_${p.id}`),
      ]);
    });
  }
  buttons.push([Markup.button.callback('➕ Add New Product', 'admin_add_product')]);
  buttons.push([Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]);
  return Markup.inlineKeyboard(buttons);
}

export function getProductDetailKeyboard(product: any) {
  const v = product.variants?.[0];
  const buttons: any[] = [];
  if (v) {
    buttons.push([
      Markup.button.callback('💰 Edit Price', `admin_prod_price_${v.id}`),
      Markup.button.callback('📥 Add Stock', `admin_add_stock_${v.id}`),
    ]);
  }
  buttons.push([
    Markup.button.callback(
      product.status === 'ACTIVE' ? '⏸ Disable' : '✅ Enable',
      `admin_prod_toggle_${product.id}`
    ),
    Markup.button.callback('🗑 Delete Product', `admin_prod_del_confirm_${product.id}`),
  ]);
  buttons.push([Markup.button.callback('⬅️ Back to Products', 'admin_products')]);
  return Markup.inlineKeyboard(buttons);
}

export function getProductDeleteConfirmKeyboard(productId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⚠️ Yes, Delete Product', `admin_prod_delete_${productId}`)],
    [Markup.button.callback('❌ Cancel', `admin_prod_view_${productId}`)],
  ]);
}

export function getAdminCategoriesKeyboard(categories?: any[]) {
  const buttons: any[] = [];
  if (categories && categories.length > 0) {
    categories.forEach((c) => {
      const statusIcon = c.isEnabled ? '✅' : '⏸';
      const prodCount = c._count?.products !== undefined ? ` (${c._count.products} prods)` : '';
      buttons.push([
        Markup.button.callback(`${statusIcon} ${c.name}${prodCount}`, `admin_cat_view_${c.id}`),
      ]);
    });
  }
  buttons.push([Markup.button.callback('➕ Add New Category', 'admin_add_category')]);
  buttons.push([Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]);
  return Markup.inlineKeyboard(buttons);
}

export function getCategoryDetailKeyboard(category: any) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        category.isEnabled ? '⏸ Disable' : '✅ Enable',
        `admin_cat_toggle_${category.id}`
      ),
      Markup.button.callback('🗑 Delete Category', `admin_cat_del_confirm_${category.id}`),
    ],
    [Markup.button.callback('➕ Add Product Here', `admin_select_cat_${category.id}`)],
    [Markup.button.callback('⬅️ Back to Categories', 'admin_categories')],
  ]);
}

export function getCategoryDeleteConfirmKeyboard(categoryId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⚠️ Yes, Delete Category', `admin_cat_delete_${categoryId}`)],
    [Markup.button.callback('❌ Cancel', `admin_cat_view_${categoryId}`)],
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
