import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
export const prisma = new PrismaClient({
    log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
    ],
});
prisma.$on('error', (e) => {
    logger.error('Prisma Error', { message: e.message });
});
prisma.$on('warn', (e) => {
    logger.warn('Prisma Warning', { message: e.message });
});
export async function connectDatabase() {
    try {
        await prisma.$connect();
        logger.info('✅ Successfully connected to database');
    }
    catch (error) {
        logger.error('❌ Failed to connect to database', { error });
        process.exit(1);
    }
}
export async function disconnectDatabase() {
    await prisma.$disconnect();
    logger.info('Database disconnected');
}
