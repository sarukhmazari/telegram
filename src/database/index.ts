import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production' || process.env.VERCEL) {
  globalForPrisma.prisma = prisma;
}

try {
  prisma.$on('error' as never, (e: any) => {
    logger.error('Prisma Error', { message: e?.message || e });
  });

  prisma.$on('warn' as never, (e: any) => {
    logger.warn('Prisma Warning', { message: e?.message || e });
  });
} catch {
  // Ignore in environments where $on is already attached
}

export async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('✅ Successfully connected to database');
  } catch (error) {
    logger.error('❌ Failed to connect to database', { error });
    throw error;
  }
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}

