import { prisma } from '../database/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { Role, TransactionType, User, PreAuthorizedStaff } from '@prisma/client';
import crypto from 'crypto';

interface CachedUser {
  user: User;
  cachedAt: number;
}

// In-memory cache for sub-millisecond user authentication
const userCache = new Map<string, CachedUser>();
const USER_CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export class UserService {
  /**
   * Helper to set user in cache
   */
  static setCachedUser(user: User) {
    userCache.set(user.telegramId.toString(), {
      user,
      cachedAt: Date.now(),
    });
    userCache.set(user.id, {
      user,
      cachedAt: Date.now(),
    });
  }

  /**
   * Helper to invalidate cache
   */
  static invalidateCache(telegramIdOrId: string | bigint | number) {
    const key = telegramIdOrId.toString();
    userCache.delete(key);
  }

  /**
   * Find existing user or auto-register a new Telegram user.
   * Utilizes an in-memory cache for ultra-fast millisecond resolution.
   */
  static async findOrCreateUser(
    telegramId: number | bigint,
    username?: string,
    firstName?: string,
    lastName?: string,
    referralCodeArg?: string
  ): Promise<User> {
    const bigTelegramId = BigInt(telegramId);
    const tgIdStr = bigTelegramId.toString();
    const isAdminConfigured = config.ADMIN_IDS.includes(tgIdStr);

    // 1. Check in-memory cache for immediate sub-millisecond response
    const cached = userCache.get(tgIdStr);
    const now = Date.now();
    if (cached && now - cached.cachedAt < USER_CACHE_TTL_MS && !referralCodeArg) {
      const u = cached.user;
      const usernameMatch = (u.username || null) === (username || null);
      const firstMatch = (u.firstName || null) === (firstName || null);
      const lastMatch = (u.lastName || null) === (lastName || null);

      if (usernameMatch && firstMatch && lastMatch) {
        return u;
      }
    }

    let user = await prisma.user.findUnique({
      where: { telegramId: bigTelegramId },
    });

    if (!user) {
      const generatedRefCode = crypto.randomBytes(4).toString('hex').toUpperCase();

      let referrerId: string | undefined = undefined;
      if (referralCodeArg && config.ENABLE_REFERRALS) {
        const referrer = await prisma.user.findUnique({
          where: { referralCode: referralCodeArg },
        });
        if (referrer && referrer.telegramId !== bigTelegramId) {
          referrerId = referrer.id;
        }
      }

      // Check if this user was pre-authorized via @username or Telegram ID
      let preAuthRole: Role = isAdminConfigured ? Role.OWNER : Role.USER;
      const preAuthChecks: string[] = [tgIdStr];
      if (username) preAuthChecks.push(username.toLowerCase());

      const preAuth = await prisma.preAuthorizedStaff.findFirst({
        where: { query: { in: preAuthChecks } },
      });

      if (preAuth) {
        preAuthRole = isAdminConfigured ? Role.OWNER : preAuth.role;
        await prisma.preAuthorizedStaff.delete({ where: { id: preAuth.id } }).catch(() => {});
        logger.info('Pre-authorized staff joined', { username, telegramId: tgIdStr, role: preAuthRole });
      }

      user = await prisma.user.create({
        data: {
          telegramId: bigTelegramId,
          username: username || null,
          firstName: firstName || null,
          lastName: lastName || null,
          role: preAuthRole,
          referralCode: generatedRefCode,
          referredById: referrerId,
          cart: {
            create: {},
          },
        },
      });

      if (referrerId) {
        await prisma.referral.create({
          data: {
            referrerId,
            referredId: user.id,
          },
        }).catch(() => {});
      }

      logger.info('Registered new user', { userId: user.id, telegramId: tgIdStr });
    } else {
      // Update names or username if changed, and ensure config admins have at least ADMIN/OWNER
      let shouldUpdate = false;
      const dataToUpdate: any = {};

      if (user.username !== (username || null)) {
        dataToUpdate.username = username || null;
        shouldUpdate = true;
      }
      if (user.firstName !== (firstName || null)) {
        dataToUpdate.firstName = firstName || null;
        shouldUpdate = true;
      }
      if (user.lastName !== (lastName || null)) {
        dataToUpdate.lastName = lastName || null;
        shouldUpdate = true;
      }
      if (isAdminConfigured && user.role === Role.USER) {
        dataToUpdate.role = Role.OWNER;
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: dataToUpdate,
        });
      }
    }

    UserService.setCachedUser(user);
    return user;
  }

  static async getUserByTelegramId(telegramId: number | bigint): Promise<User | null> {
    const tgIdStr = telegramId.toString();
    const cached = userCache.get(tgIdStr);
    if (cached && Date.now() - cached.cachedAt < USER_CACHE_TTL_MS) {
      return cached.user;
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });

    if (user) {
      UserService.setCachedUser(user);
    }
    return user;
  }

  static async getUserById(id: string): Promise<User | null> {
    const cached = userCache.get(id);
    if (cached && Date.now() - cached.cachedAt < USER_CACHE_TTL_MS) {
      return cached.user;
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (user) {
      UserService.setCachedUser(user);
    }
    return user;
  }

  /**
   * Safe transaction-backed wallet balance modification
   */
  static async updateBalance(
    userId: string,
    amount: number,
    type: TransactionType,
    description: string,
    referenceId?: string
  ): Promise<User> {
    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found for balance update');
      }

      const currentBalance = Number(user.balance);
      const newBalance = currentBalance + amount;

      if (newBalance < 0) {
        throw new Error('Insufficient wallet balance');
      }

      const res = await tx.user.update({
        where: { id: userId },
        data: { balance: newBalance },
      });

      await tx.walletTransaction.create({
        data: {
          userId,
          amount,
          type,
          balanceAfter: newBalance,
          description,
          referenceId: referenceId || null,
        },
      });

      return res;
    });

    UserService.setCachedUser(updatedUser);
    logger.info('Updated user balance', { userId, amount, newBalance: updatedUser.balance, type });
    return updatedUser;
  }

  static async banUser(userId: string): Promise<User> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isBanned: true },
    });
    UserService.setCachedUser(user);
    return user;
  }

  static async unbanUser(userId: string): Promise<User> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isBanned: false },
    });
    UserService.setCachedUser(user);
    return user;
  }

  /**
   * Search for a user by @username or Telegram ID string
   */
  static async findUserByUsernameOrId(query: string): Promise<User | null> {
    const cleanQuery = query.trim().replace(/^@/, '');

    // Check if numeric (Telegram ID)
    if (/^\d+$/.test(cleanQuery)) {
      const byTelegramId = await UserService.getUserByTelegramId(BigInt(cleanQuery));
      if (byTelegramId) return byTelegramId;
    }

    // Search by username (case-insensitive)
    const byUsername = await prisma.user.findFirst({
      where: {
        username: {
          equals: cleanQuery,
          mode: 'insensitive',
        },
      },
    });

    if (byUsername) {
      UserService.setCachedUser(byUsername);
    }

    return byUsername;
  }

  /**
   * Pre-authorize a @username or Telegram ID as staff (for users not yet in the bot).
   * Uses upsert so re-running with same query just updates the role.
   */
  static async preAuthorizeStaff(query: string, role: Role, addedBy?: string): Promise<PreAuthorizedStaff> {
    const normalizedQuery = query.trim().replace(/^@/, '').toLowerCase();
    return prisma.preAuthorizedStaff.upsert({
      where: { query: normalizedQuery },
      update: { role, addedBy: addedBy || null, updatedAt: new Date() },
      create: { query: normalizedQuery, role, addedBy: addedBy || null },
    });
  }

  /**
   * Get all pre-authorized staff records (pending — not yet joined)
   */
  static async getAllPreAuthorizedStaff(): Promise<PreAuthorizedStaff[]> {
    return prisma.preAuthorizedStaff.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Delete a pre-authorized staff record by its id
   */
  static async deletePreAuthorizedStaff(id: string): Promise<void> {
    await prisma.preAuthorizedStaff.delete({ where: { id } }).catch(() => {});
  }

  /**
   * Change user role (OWNER, ADMIN, USER)
   */
  static async setUserRole(userId: string, role: Role): Promise<User> {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });
    UserService.setCachedUser(updated);
    logger.info('User role updated', { userId, role });
    return updated;
  }

  /**
   * Get all users who are currently staff (OWNER or ADMIN)
   */
  static async getAllStaffUsers(): Promise<User[]> {
    return prisma.user.findMany({
      where: {
        role: { in: [Role.OWNER, Role.ADMIN] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
