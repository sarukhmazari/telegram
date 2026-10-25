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
   * Validate Telegram username format
   * - Strips leading '@'
   * - Checks length and allowed characters (a-zA-Z0-9_)
   * - When isBot is true, checks that the username ends with 'bot' (case-insensitive) per Telegram bot rules
   */
  static validateUsername(
    rawInput: string | null | undefined,
    isBot = false
  ): { valid: boolean; clean: string; error?: string } {
    if (!rawInput) {
      return { valid: false, clean: '', error: 'Username cannot be empty.' };
    }

    const clean = rawInput.trim().replace(/^@+/, '');

    if (clean.length === 0) {
      return { valid: false, clean: '', error: 'Username cannot be empty.' };
    }

    const minLen = isBot ? 5 : 3;
    const maxLen = 32;

    if (clean.length < minLen) {
      return {
        valid: false,
        clean,
        error: `${isBot ? 'Bot' : 'Support'} username must be at least ${minLen} characters long.`,
      };
    }

    if (clean.length > maxLen) {
      return {
        valid: false,
        clean,
        error: `${isBot ? 'Bot' : 'Support'} username cannot exceed ${maxLen} characters.`,
      };
    }

    // Allowed characters: Latin letters, numbers, and underscores
    if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
      return {
        valid: false,
        clean,
        error: 'Username can only contain letters (a-z), numbers (0-9), and underscores (_).',
      };
    }

    if (isBot && !/bot$/i.test(clean)) {
      return {
        valid: false,
        clean,
        error: "Telegram bot usernames must end with 'bot' (e.g. 'StoreBot' or 'my_store_bot').",
      };
    }

    return { valid: true, clean };
  }

  /**
   * Retrieve the configured Telegram bot username
   * Priority:
   * 1. Database setting 'bot_username'
   * 2. Config BOT_USERNAME environment variable
   * 3. Fallback parameter (e.g., bot.botInfo?.username or Telegram getMe)
   * 4. Default fallback 'StoreBot'
   */
  static async getBotUsername(fallback?: string): Promise<string> {
    const dbValue = await SettingService.getSetting('bot_username');
    if (dbValue && dbValue.trim().length > 0) {
      return dbValue.trim().replace(/^@+/, '');
    }

    if (config.BOT_USERNAME && config.BOT_USERNAME.trim().length > 0) {
      return config.BOT_USERNAME.trim().replace(/^@+/, '');
    }

    if (fallback && fallback.trim().length > 0) {
      return fallback.trim().replace(/^@+/, '');
    }

    return 'StoreBot';
  }

  /**
   * Update the configured Telegram bot username
   */
  static async setBotUsername(
    rawUsername: string
  ): Promise<{ success: boolean; username?: string; error?: string }> {
    const validation = SettingService.validateUsername(rawUsername, true);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    await SettingService.setSetting('bot_username', validation.clean);
    return { success: true, username: validation.clean };
  }

  /**
   * Retrieve the active support username (or null if disabled/not set)
   */
  static async getSupportUsername(): Promise<string | null> {
    const dbValue = await SettingService.getSetting('support_username');
    if (dbValue === '__NONE__') return null;
    if (dbValue && dbValue.trim().length > 0) {
      return dbValue.trim().replace(/^@+/, '');
    }
    return config.SUPPORT_USERNAME && config.SUPPORT_USERNAME.trim().length > 0
      ? config.SUPPORT_USERNAME.trim().replace(/^@+/, '')
      : null;
  }

  /**
   * Update or disable the active support username
   */
  static async setSupportUsername(
    rawUsername: string | null
  ): Promise<{ success: boolean; username?: string | null; error?: string }> {
    if (!rawUsername || rawUsername.trim() === '' || rawUsername === '__NONE__') {
      await SettingService.setSetting('support_username', '__NONE__');
      return { success: true, username: null };
    }

    const validation = SettingService.validateUsername(rawUsername, false);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    await SettingService.setSetting('support_username', validation.clean);
    return { success: true, username: validation.clean };
  }

  /**
   * Generate a direct Telegram link to the support handle (or null if not configured)
   */
  static async getSupportLink(providedUsername?: string | null): Promise<string | null> {
    const username = providedUsername !== undefined ? providedUsername : await SettingService.getSupportUsername();
    if (!username) return null;
    const clean = username.trim().replace(/^@+/, '');
    return `https://t.me/${clean}`;
  }

  /**
   * Generate a direct Telegram link or deep link to the configured bot
   */
  static async getBotLink(fallback?: string, startParam?: string): Promise<string> {
    const username = await SettingService.getBotUsername(fallback);
    const base = `https://t.me/${username}`;
    return startParam ? `${base}?start=${startParam}` : base;
  }

  /**
   * Delete a setting
   */
  static async deleteSetting(key: string): Promise<void> {
    settingCache.delete(key);
    await prisma.setting.delete({ where: { key } }).catch(() => {});
    logger.info('Setting deleted', { key });
  }

  /**
   * Clear in-memory settings cache (useful for test isolation)
   */
  static clearSettingCache(): void {
    settingCache.clear();
  }
}

