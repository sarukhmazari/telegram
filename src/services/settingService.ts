import { prisma } from '../database/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

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
   * Retrieve the active support username (or null if disabled/not set)
   */
  static async getSupportUsername(): Promise<string | null> {
    const dbValue = await SettingService.getSetting('support_username');
    if (dbValue === '__NONE__') return null;
    if (dbValue) return dbValue.replace(/^@/, '');
    return config.SUPPORT_USERNAME ? config.SUPPORT_USERNAME.replace(/^@/, '') : null;
  }

  /**
   * Delete a setting
   */
  static async deleteSetting(key: string): Promise<void> {
    await prisma.setting.delete({ where: { key } }).catch(() => {});
    logger.info('Setting deleted', { key });
  }
}
