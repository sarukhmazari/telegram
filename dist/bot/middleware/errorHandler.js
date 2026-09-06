import { logger } from '../../utils/logger.js';
const HARMLESS_ERRORS = [
    'message is not modified',
    'query is too old',
    'QUERY_ID_INVALID',
    'message to edit not found',
    'message can\'t be edited',
    'timeout',
];
export async function handleBotError(err, ctx) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    // Ignore harmless Telegram API errors caused by rapid button tapping or stale queries
    if (HARMLESS_ERRORS.some((msg) => errorMessage.toLowerCase().includes(msg.toLowerCase()))) {
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery().catch(() => { });
        }
        return;
    }
    logger.error('Unhandled bot exception', {
        error: errorMessage,
        stack: err instanceof Error ? err.stack : undefined,
        userId: ctx.from?.id,
        updateType: ctx.updateType,
    });
    try {
        const userMessage = '⚠️ Something went wrong while processing your request. Please try again or contact support.';
        if (ctx.callbackQuery) {
            await ctx.answerCbQuery(userMessage, { show_alert: true }).catch(() => { });
        }
        else {
            await ctx.reply(userMessage).catch(() => { });
        }
    }
    catch (replyError) {
        logger.error('Failed to send error notification to user', { replyError });
    }
}
