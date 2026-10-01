import { prisma } from '../database/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

interface CachedSetting {
  value: string | null;
  cachedAt: number;
}

const settingCache = new Map<string, CachedSetting>();
const SETTING_CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export class SettingService {
  /**
   * Retrieve a setting by key (cached for speed)
   */
  static async getSetting(key: string): Promise<string | null> {
    const cached = settingCache.get(key);
    if (cached && Date.now() - cached.cachedAt < SETTING_CACHE_TTL_MS) {
      return cached.value;
    }

    try {
      const setting = await prisma.setting.findUnique({
        where: { key },
      });
      const val = setting ? setting.value : null;
      settingCache.set(key, { value: val, cachedAt: Date.now() });
      return val;
    } catch (err: any) {
      logger.error('Failed to fetch setting', { key, error: err.message });
      return cached ? cached.value : null;
    }
  }

  /**
   * Upsert a setting key-value pair
   */
  static async setSetting(key: string, value: string): Promise<void> {
    settingCache.set(key, { value, cachedAt: Date.now() });
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
    settingCache.delete(key);
    await prisma.setting.delete({ where: { key } }).catch(() => {});
    logger.info('Setting deleted', { key });
  }
}

