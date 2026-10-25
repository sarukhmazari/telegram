import { describe, it, expect, beforeEach } from 'vitest';
import { SettingService } from '../src/services/settingService.js';
import { prisma } from '../src/database/index.js';

describe('Telegram Bot & Support Username Settings', () => {
  beforeEach(() => {
    SettingService.clearSettingCache();
  });

  describe('Username Validation', () => {
    it('validates bot usernames properly', () => {
      // Valid cases
      expect(SettingService.validateUsername('test_store_bot', true).valid).toBe(true);
      expect(SettingService.validateUsername('@MySuperBot', true).valid).toBe(true);
      expect(SettingService.validateUsername('@MySuperBot', true).clean).toBe('MySuperBot');
      expect(SettingService.validateUsername('botbot', true).valid).toBe(true);

      // Invalid: missing 'bot' ending
      const noBot = SettingService.validateUsername('store_official', true);
      expect(noBot.valid).toBe(false);
      expect(noBot.error).toContain("must end with 'bot'");

      // Invalid: too short (< 5)
      const tooShort = SettingService.validateUsername('@bot', true);
      expect(tooShort.valid).toBe(false);
      expect(tooShort.error).toContain('at least 5 characters');

      // Invalid: empty or whitespace
      expect(SettingService.validateUsername('', true).valid).toBe(false);
      expect(SettingService.validateUsername('   ', true).valid).toBe(false);
      expect(SettingService.validateUsername('@@', true).valid).toBe(false);

      // Invalid: illegal characters
      const invalidChars = SettingService.validateUsername('@bad-bot!', true);
      expect(invalidChars.valid).toBe(false);
      expect(invalidChars.error).toContain('letters');
    });

    it('validates support usernames properly', () => {
      // Valid cases
      expect(SettingService.validateUsername('support_team', false).valid).toBe(true);
      expect(SettingService.validateUsername('@support_team', false).valid).toBe(true);
      expect(SettingService.validateUsername('@support_team', false).clean).toBe('support_team');
      expect(SettingService.validateUsername('adm', false).valid).toBe(true);

      // Invalid: too short (< 3)
      const tooShort = SettingService.validateUsername('@ab', false);
      expect(tooShort.valid).toBe(false);
      expect(tooShort.error).toContain('at least 3 characters');

      // Invalid: illegal characters
      const invalidChars = SettingService.validateUsername('@support.team', false);
      expect(invalidChars.valid).toBe(false);
    });
  });

  describe('Database Persistence & Retrieval', () => {
    it('saves and retrieves bot username persistently', async () => {
      const testBotUsername = 'mazari_test_bot';

      const saveRes = await SettingService.setBotUsername(`@${testBotUsername}`);
      expect(saveRes.success).toBe(true);
      expect(saveRes.username).toBe(testBotUsername);

      // Invalidate memory cache to verify database persistence
      SettingService.clearSettingCache();

      const retrieved = await SettingService.getBotUsername('fallback_bot');
      expect(retrieved).toBe(testBotUsername);

      // Verify directly in Prisma DB
      const dbRecord = await prisma.setting.findUnique({
        where: { key: 'bot_username' },
      });
      expect(dbRecord?.value).toBe(testBotUsername);
    }, 15000);

    it('saves, retrieves and clears support username persistently', async () => {
      const testSupport = 'mazari_support_admin';

      const saveRes = await SettingService.setSupportUsername(`@${testSupport}`);
      expect(saveRes.success).toBe(true);
      expect(saveRes.username).toBe(testSupport);

      // Invalidate memory cache
      SettingService.clearSettingCache();

      const retrieved = await SettingService.getSupportUsername();
      expect(retrieved).toBe(testSupport);

      // Clear support handle
      const clearRes = await SettingService.setSupportUsername(null);
      expect(clearRes.success).toBe(true);
      expect(clearRes.username).toBeNull();

      SettingService.clearSettingCache();
      const clearedVal = await SettingService.getSupportUsername();
      expect(clearedVal).toBeNull();

      // Reset to a valid handle for other test dependencies
      await SettingService.setSupportUsername('zoxer19');
    }, 15000);
  });

  describe('Telegram Links Generation', () => {
    it('generates valid direct and deep bot links', async () => {
      const botLink = await SettingService.getBotLink('my_store_bot');
      expect(botLink.startsWith('https://t.me/')).toBe(true);

      const deepLink = await SettingService.getBotLink('my_store_bot', 'ref12345');
      expect(deepLink).toContain('?start=ref12345');
    });

    it('generates valid support links and handles empty state gracefully', async () => {
      const link = await SettingService.getSupportLink('support_team');
      expect(link).toBe('https://t.me/support_team');

      const nullLink = await SettingService.getSupportLink(null);
      expect(nullLink).toBeNull();
    });
  });
});
