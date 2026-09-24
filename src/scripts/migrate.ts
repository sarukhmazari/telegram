import { prisma } from '../database/index.js';

async function main() {
  console.log('Connecting to database...');
  await prisma.$connect();

  console.log('Creating PreAuthorizedStaff table if not exists...');
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PreAuthorizedStaff" (
        "id" TEXT NOT NULL,
        "query" TEXT NOT NULL,
        "role" "Role" NOT NULL DEFAULT 'ADMIN',
        "addedBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "PreAuthorizedStaff_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "PreAuthorizedStaff_query_key" ON "PreAuthorizedStaff"("query");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "PreAuthorizedStaff_query_idx" ON "PreAuthorizedStaff"("query");
    `);
    console.log('✅ PreAuthorizedStaff table created.');
  } catch (err: any) {
    console.error('Error creating PreAuthorizedStaff table:', err.message);
  }

  await prisma.$disconnect();
  console.log('Done!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
