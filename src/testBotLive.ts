import { bot } from './bot/index.js';
import { prisma } from './database/index.js';

console.log('=== STARTING TEST BOT DIAGNOSTIC ===');

prisma.user.count().then((count) => {
  console.log('Database connected! User count:', count);
}).catch((err) => {
  console.error('Database connection error:', err);
});

bot.on('message', async (ctx) => {
  console.log('RECEIVED MESSAGE IN TEST BOT:', ctx.message);
  await ctx.reply('HELLO FROM BOT! It is working! 🎉');
});

bot.on('callback_query', async (ctx) => {
  console.log('RECEIVED CALLBACK QUERY:', ctx.callbackQuery);
});

console.log('Bot instance ready. Starting listener...');
