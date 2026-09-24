import { prisma } from '../database/index.js';
import { logger } from '../utils/logger.js';

export class SettingService {
  /**
   * Retrieve a setting by key
   */
  static async getSetting(key: string): Promise<string | null> {
    try {
      const setting = await prisma.setting.findUnique({
        where: { key },
      });
      return setting ? setting.value : null;
    } catch (err: any) {
      logger.error('Failed to fetch setting', { key, error: err.message });
      return null;
    }
  }

  /**
   * Upsert a setting key-value pair
   */
  static async setSetting(key: string, value: string): Promise<void> {
    await prisma.setting.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value },
    });
    logger.info('Setting updated', { key, value });
  }

  /**
   * Delete a setting
   */
  static async deleteSetting(key: string): Promise<void> {
    await prisma.setting.delete({ where: { key } }).catch(() => {});
    logger.info('Setting deleted', { key });
  }
}
