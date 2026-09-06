import { Markup } from 'telegraf';
export function getMainMenuKeyboard(isAdmin = false) {
    const buttons = [
        [Markup.button.callback('🛍 Store', 'menu_store'), Markup.button.callback('📦 My Orders', 'menu_orders')],
        [Markup.button.callback('💰 Balance', 'menu_balance'), Markup.button.callback('🎁 Promotions', 'menu_promotions')],
        [Markup.button.callback('📞 Support', 'menu_support'), Markup.button.callback('👤 My Account', 'menu_account')],
    ];
    if (isAdmin) {
        buttons.push([Markup.button.callback('⚙️ Admin Panel', 'admin_main')]);
    }
    return Markup.inlineKeyboard(buttons);
}
export function getBackHomeKeyboard(backCallback = 'menu_main') {
    return Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Back', backCallback), Markup.button.callback('🏠 Home', 'menu_main')],
    ]);
}
