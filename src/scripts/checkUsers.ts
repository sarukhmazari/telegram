import { prisma } from '../database/index.js';

async function main() {
  const users = await prisma.user.findMany();
  console.log(`Found ${users.length} users in database:`);
  users.forEach((u) => {
    console.log(`- ID: ${u.id}, TelegramId: ${u.telegramId}, Username: @${u.username}, Role: ${u.role}, Name: ${u.firstName}`);
  });
  await prisma.$disconnect();
}

main().catch(console.error);
