import { describe, it, expect, vi } from 'vitest';
import { UserService } from '../services/userService.js';
import { prisma } from '../database/index.js';

vi.mock('../database/index.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('UserService Unit Tests', () => {
  it('should auto-register a new user and assign a referral code', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (prisma.user.create as any).mockImplementation(({ data }: any) => Promise.resolve({
      id: 'usr-123',
      telegramId: BigInt(data.telegramId),
      username: data.username,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      referralCode: data.referralCode,
      balance: 0,
      isBanned: false,
    }));

    const user = await UserService.findOrCreateUser(123456789, 'testuser', 'Test', 'User');

    expect(user.telegramId).toEqual(BigInt(123456789));
    expect(user.username).toBe('testuser');
    expect(user.referralCode).toBeDefined();
  });
});
