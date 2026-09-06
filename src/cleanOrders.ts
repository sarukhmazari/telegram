import { prisma } from './database/index.js';

async function cleanUserOrders() {
  console.log('🧹 Cleaning test orders from database...');

  const telegramId = BigInt('8371873408');

  const user = await prisma.user.findUnique({
    where: { telegramId },
  });

  if (!user) {
    console.log('User not found.');
    process.exit(0);
  }

  // Delete payments, order items, and orders for user
  const userOrders = await prisma.order.findMany({
    where: { userId: user.id },
    select: { id: true },
  });

  const orderIds = userOrders.map((o) => o.id);

  if (orderIds.length > 0) {
    await prisma.payment.deleteMany({
      where: { orderId: { in: orderIds } },
    });

    await prisma.orderItem.deleteMany({
      where: { orderId: { in: orderIds } },
    });

    await prisma.order.deleteMany({
      where: { id: { in: orderIds } },
    });

    console.log(`✅ Successfully deleted ${orderIds.length} test order(s) for user @${user.username || user.telegramId.toString()}`);
  } else {
    console.log('No orders found to delete.');
  }

  process.exit(0);
}

cleanUserOrders().catch((err) => {
  console.error('❌ Failed to clean orders:', err);
  process.exit(1);
});
