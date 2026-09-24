import { prisma } from '../database/index.js';

async function main() {
  console.log('Connecting to database...');
  await prisma.$connect();

  console.log('Adding OWNER to Role enum if not exists...');
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OWNER';`);
    console.log('✅ Role enum updated.');
  } catch (err: any) {
    console.log('Note on Role enum:', err.message);
  }

  console.log('Creating PaymentAccount table if not exists...');
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PaymentAccount" (
        "id" TEXT NOT NULL,
        "providerName" TEXT NOT NULL,
        "accountNumber" TEXT NOT NULL,
        "accountTitle" TEXT NOT NULL,
        "instructions" TEXT,
        "isEnabled" BOOLEAN NOT NULL DEFAULT true,
        "position" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "PaymentAccount_isEnabled_idx" ON "PaymentAccount"("isEnabled");
    `);
    console.log('✅ PaymentAccount table created.');
  } catch (err: any) {
    console.error('Error creating PaymentAccount table:', err.message);
  }

  await prisma.$disconnect();
  console.log('Done!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
