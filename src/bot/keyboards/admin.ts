import { Markup } from 'telegraf';
import { PaymentAccount, User } from '@prisma/client';

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
    [Markup.button.callback('📝 Change Description', 'admin_change_description')],
    [Markup.button.callback('🖼 Change Profile Photo', 'admin_change_photo')],
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
 * The callback data uses a base64-encoded query to avoid issues with special characters.
 */
export function getPreAuthRoleKeyboard(rawQuery: string) {
  const encoded = Buffer.from(rawQuery).toString('base64');
  return Markup.inlineKeyboard([
    [Markup.button.callback('👑 Pre-authorize as Owner', `admin_preauth_OWNER_${encoded}`)],
    [Markup.button.callback('🛡 Pre-authorize as Admin', `admin_preauth_ADMIN_${encoded}`)],
    [Markup.button.callback('❌ Cancel', 'admin_roles')],
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
