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
  const variants = product.variants || [];
  const buttons: any[] = [];

  // If product has 1 variant, offer direct price edit and stock addition shortcuts
  if (variants.length === 1) {
    buttons.push([
      Markup.button.callback('📥 Add Stock', `admin_add_stock_${variants[0].id}`),
      Markup.button.callback('💰 Edit Price', `admin_var_edit_price_${variants[0].id}`),
    ]);
  } else {
    buttons.push([
      Markup.button.callback('📥 Add Stock', `admin_prod_stock_menu_${product.id}`),
    ]);
  }

  buttons.push([
    Markup.button.callback(`🗂 Sub-Categories / Plans (${variants.length})`, `admin_prod_vars_${product.id}`),
    Markup.button.callback('➕ Add Sub-Category', `admin_var_add_${product.id}`),
  ]);

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

export function getAdminProductVariantsKeyboard(product: any, variants: any[]) {
  const buttons: any[] = [];

  if (variants && variants.length > 0) {
    variants.forEach((v) => {
      const statusIcon = v.isEnabled ? '✅' : '⏸';
      const durationBadge = v.duration ? ` [${v.duration}]` : '';
      const stockBadge = ` (Stock: ${v.stockCount ?? v._count?.stockItems ?? 0})`;
      const priceBadge = ` — Rs. ${Number(v.price).toFixed(0)}`;
      buttons.push([
        Markup.button.callback(
          `${statusIcon} ${v.name}${priceBadge}${durationBadge}${stockBadge}`,
          `admin_var_view_${v.id}`
        ),
      ]);
    });
  }

  buttons.push([Markup.button.callback('➕ Add New Sub-Category / Plan', `admin_var_add_${product.id}`)]);
  buttons.push([
    Markup.button.callback('📥 Add Stock to Product', `admin_prod_stock_menu_${product.id}`),
    Markup.button.callback('⬅️ Product Details', `admin_prod_view_${product.id}`),
  ]);
  buttons.push([Markup.button.callback('⬅️ Back to Products', 'admin_products')]);

  return Markup.inlineKeyboard(buttons);
}

export function getAdminVariantDetailKeyboard(variant: any) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📥 Add Stock to this Plan', `admin_add_stock_${variant.id}`),
      Markup.button.callback('💰 Edit Price', `admin_var_edit_price_${variant.id}`),
    ],
    [
      Markup.button.callback('🏷 Edit Plan Name', `admin_var_edit_name_${variant.id}`),
      Markup.button.callback('📝 Edit Warranty/Details', `admin_var_edit_details_${variant.id}`),
    ],
    [
      Markup.button.callback(
        variant.deliveryType === 'AUTOMATIC' ? '⚡ Auto Delivery' : '🖐 Manual Delivery',
        `admin_var_toggle_delivery_${variant.id}`
      ),
      Markup.button.callback(
        variant.isEnabled ? '⏸ Disable Plan' : '✅ Enable Plan',
        `admin_var_toggle_${variant.id}`
      ),
    ],
    [
      Markup.button.callback('🗑 Delete Stock Items', `admin_delete_stock_variant_${variant.id}`),
      Markup.button.callback('🗑 Remove Sub-Category', `admin_var_del_confirm_${variant.id}`),
    ],
    [
      Markup.button.callback('🗂 All Sub-Categories', `admin_prod_vars_${variant.productId}`),
      Markup.button.callback('📦 Product Details', `admin_prod_view_${variant.productId}`),
    ],
  ]);
}

export function getVariantDeleteConfirmKeyboard(variantId: string, productId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⚠️ Yes, Remove Sub-Category', `admin_var_delete_${variantId}`)],
    [Markup.button.callback('❌ Cancel', `admin_var_view_${variantId}`)],
  ]);
}

export function getSelectVariantForStockKeyboard(product: any, variants: any[]) {
  const buttons: any[] = [];

  variants.forEach((v) => {
    const stockCount = v.stockCount ?? v._count?.stockItems ?? 0;
    const durationBadge = v.duration ? ` [${v.duration}]` : '';
    buttons.push([
      Markup.button.callback(
        `📥 ${v.name} (Stock: ${stockCount} | Rs. ${Number(v.price).toFixed(0)}${durationBadge})`,
        `admin_add_stock_${v.id}`
      ),
    ]);
  });

  buttons.push([Markup.button.callback('➕ Create New Sub-Category / Plan', `admin_var_add_${product.id}`)]);
  buttons.push([Markup.button.callback('⬅️ Back to Product', `admin_prod_view_${product.id}`)]);

  return Markup.inlineKeyboard(buttons);
}

export function getAdminStockProductsKeyboard(products: any[]) {
  const buttons: any[] = [];

  products.forEach((p) => {
    const totalStock = p.variants?.reduce(
      (sum: number, v: any) => sum + (v.stockCount ?? v._count?.stockItems ?? 0),
      0
    ) ?? 0;
    const planCount = p.variants?.length || 0;
    const planText = planCount === 1 ? '1 plan' : `${planCount} plans`;
    buttons.push([
      Markup.button.callback(
        `📦 ${p.name} (Stock: ${totalStock} across ${planText})`,
        `admin_stock_prod_${p.id}`
      ),
    ]);
  });

  buttons.push([Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]);
  return Markup.inlineKeyboard(buttons);
}

export function getAdminStockProductPlansKeyboard(product: any, variants: any[]) {
  const buttons: any[] = [];

  variants.forEach((v) => {
    const stockCount = v.stockCount ?? v._count?.stockItems ?? 0;
    buttons.push([
      Markup.button.callback(`📥 Add: ${v.name} (Stock: ${stockCount})`, `admin_add_stock_${v.id}`),
      Markup.button.callback(`🗑 Delete Stock (${stockCount})`, `admin_delete_stock_variant_${v.id}`),
    ]);
  });

  buttons.push([
    Markup.button.callback('➕ Add New Sub-Category / Plan', `admin_var_add_${product.id}`),
  ]);
  buttons.push([
    Markup.button.callback('🗂 Manage Sub-Categories', `admin_prod_vars_${product.id}`),
    Markup.button.callback('⬅️ Back to Stock List', 'admin_stock'),
  ]);

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

export function getAdminCouponsKeyboard(coupons: any[]) {
  const buttons: any[] = [];

  if (coupons && coupons.length > 0) {
    coupons.forEach((c) => {
      const statusIcon = c.isEnabled ? '✅' : '⏸';
      const valStr = c.discountType === 'PERCENTAGE' ? `${c.discountValue}% OFF` : `Rs. ${Number(c.discountValue).toFixed(0)} OFF`;
      buttons.push([
        Markup.button.callback(`${statusIcon} ${c.code} — ${valStr} (${c.usageCount} uses)`, `admin_coupon_view_${c.id}`),
      ]);
    });
  }

  buttons.push([Markup.button.callback('➕ Create New Coupon', 'admin_coupon_add')]);
  buttons.push([Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]);
  return Markup.inlineKeyboard(buttons);
}

export function getCouponDetailKeyboard(coupon: any) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        coupon.isEnabled ? '⏸ Disable Coupon' : '✅ Enable Coupon',
        `admin_coupon_toggle_${coupon.id}`
      ),
      Markup.button.callback('🗑 Delete Coupon', `admin_coupon_del_confirm_${coupon.id}`),
    ],
    [Markup.button.callback('⬅️ Back to Coupons', 'admin_coupons')],
  ]);
}

export function getCouponDeleteConfirmKeyboard(couponId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⚠️ Yes, Delete Coupon', `admin_coupon_delete_${couponId}`)],
    [Markup.button.callback('❌ Cancel', `admin_coupon_view_${couponId}`)],
  ]);
}

export function getAdminUsersKeyboard(users: any[]) {
  const buttons: any[] = [];

  if (users && users.length > 0) {
    users.forEach((u) => {
      const icon = u.isBanned ? '🚫' : (u.role === 'OWNER' ? '👑' : (u.role === 'ADMIN' ? '🛡' : '👤'));
      const nameStr = u.username ? `@${u.username}` : (u.firstName || u.telegramId.toString());
      const balanceStr = `Rs. ${Number(u.balance).toFixed(0)}`;
      buttons.push([
        Markup.button.callback(`${icon} ${nameStr} (${balanceStr})`, `admin_user_view_${u.id}`),
      ]);
    });
  }

  buttons.push([Markup.button.callback('🔍 Search User by Username / ID', 'admin_user_search')]);
  buttons.push([Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]);
  return Markup.inlineKeyboard(buttons);
}

export function getUserDetailKeyboard(user: any) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 Adjust Balance (+ / -)', `admin_user_balance_${user.id}`),
      Markup.button.callback(
        user.isBanned ? '✅ Unban Customer' : '🚫 Ban Customer',
        `admin_user_ban_toggle_${user.id}`
      ),
    ],
    [Markup.button.callback(`🛡 Staff Role [${user.role}]`, `admin_roles_view_${user.id}`)],
    [Markup.button.callback('⬅️ Back to Users', 'admin_users')],
  ]);
}

export function getAdminOrdersKeyboard(orders: any[], filter: string = 'ALL') {
  const buttons: any[] = [];

  buttons.push([
    Markup.button.callback(filter === 'ALL' ? '🔘 All' : 'All', 'admin_orders_filter_ALL'),
    Markup.button.callback(filter === 'PENDING' ? '🔘 Pending' : 'Pending', 'admin_orders_filter_PENDING'),
    Markup.button.callback(filter === 'COMPLETED' ? '🔘 Completed' : 'Completed', 'admin_orders_filter_COMPLETED'),
  ]);

  if (orders && orders.length > 0) {
    orders.forEach((o) => {
      const statusIcon = o.orderStatus === 'COMPLETED' || o.orderStatus === 'DELIVERED' ? '✅' : (o.orderStatus === 'CANCELLED' ? '❌' : '⏳');
      const userStr = o.user?.username ? `@${o.user.username}` : (o.user?.firstName || 'User');
      buttons.push([
        Markup.button.callback(`${statusIcon} #${o.orderNumber} — Rs. ${Number(o.totalAmount).toFixed(0)} (${userStr})`, `admin_order_view_${o.id}`),
      ]);
    });
  }

  buttons.push([Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]);
  return Markup.inlineKeyboard(buttons);
}

export function getOrderDetailKeyboard(order: any) {
  const buttons: any[] = [];
  if (order.paymentStatus === 'WAITING_FOR_VERIFICATION') {
    buttons.push([Markup.button.callback('💳 Verify Payment', 'admin_payments')]);
  }
  buttons.push([Markup.button.callback('⬅️ Back to Orders', 'admin_orders')]);
  return Markup.inlineKeyboard(buttons);
}

export function getAdminReviewsKeyboard(reviews: any[]) {
  const buttons: any[] = [];

  if (reviews && reviews.length > 0) {
    reviews.forEach((r) => {
      const stars = '⭐'.repeat(Math.max(1, Math.min(5, r.rating)));
      const prodName = r.product?.name ? r.product.name.substring(0, 15) : 'Product';
      const userStr = r.user?.username ? `@${r.user.username}` : (r.user?.firstName || 'User');
      buttons.push([
        Markup.button.callback(`${stars} [${prodName}] ${userStr}`, `admin_review_view_${r.id}`),
      ]);
    });
  }

  buttons.push([Markup.button.callback('⬅️ Back to Admin Panel', 'admin_main')]);
  return Markup.inlineKeyboard(buttons);
}

export function getReviewDetailKeyboard(review: any) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        review.isApproved ? '⏸ Hide Review' : '✅ Approve Review',
        `admin_review_toggle_${review.id}`
      ),
      Markup.button.callback('🗑 Delete Review', `admin_review_delete_${review.id}`),
    ],
    [Markup.button.callback('⬅️ Back to Reviews', 'admin_reviews')],
  ]);
}
