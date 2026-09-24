import { prisma } from '../database/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { Role, TransactionType, User, PreAuthorizedStaff } from '@prisma/client';
import crypto from 'crypto';

export class UserService {
  /**
   * Find existing user or auto-register a new Telegram user.
   */
  static async findOrCreateUser(
    telegramId: number | bigint,
    username?: string,
    firstName?: string,
    lastName?: string,
    referralCodeArg?: string
  ): Promise<User> {
    const bigTelegramId = BigInt(telegramId);
    const isAdminConfigured = config.ADMIN_IDS.includes(bigTelegramId.toString());
    const initialRole: Role = isAdminConfigured ? Role.OWNER : Role.USER;

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
      let preAuthRole: Role = initialRole;
      const preAuthChecks: string[] = [bigTelegramId.toString()];
      if (username) preAuthChecks.push(username.toLowerCase());

      const preAuth = await prisma.preAuthorizedStaff.findFirst({
        where: { query: { in: preAuthChecks } },
      });

      if (preAuth) {
        // Pre-auth role takes precedence unless user is already a root admin
        preAuthRole = isAdminConfigured ? Role.OWNER : preAuth.role;
        // Remove pre-authorization record — it has been consumed
        await prisma.preAuthorizedStaff.delete({ where: { id: preAuth.id } }).catch(() => {});
        logger.info('Pre-authorized staff joined', { username, telegramId: bigTelegramId.toString(), role: preAuthRole });
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
        });
      }

      logger.info('Registered new user', { userId: user.id, telegramId: bigTelegramId.toString() });
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

      // Also check if this existing user has a pending pre-authorization
      // (e.g. they were added by admin but the record matched a different lookup key)
      if (!shouldUpdate || !dataToUpdate.role) {
        const preAuthChecks: string[] = [user.telegramId.toString()];
        if (username) preAuthChecks.push(username.toLowerCase());
        const preAuth = await prisma.preAuthorizedStaff.findFirst({
          where: { query: { in: preAuthChecks } },
        });
        if (preAuth && user.role === Role.USER) {
          dataToUpdate.role = preAuth.role;
          shouldUpdate = true;
          await prisma.preAuthorizedStaff.delete({ where: { id: preAuth.id } }).catch(() => {});
          logger.info('Applied pre-auth role to existing user', { userId: user.id, role: preAuth.role });
        }
      }

      if (shouldUpdate) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: dataToUpdate,
        });
      }
    }

    return user;
  }

  static async getUserByTelegramId(telegramId: number | bigint): Promise<User | null> {
    return prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
    });
  }

  static async getUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
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
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found for balance update');
      }

      const currentBalance = Number(user.balance);
      const newBalance = currentBalance + amount;

      if (newBalance < 0) {
        throw new Error('Insufficient wallet balance');
      }

      const updatedUser = await tx.user.update({
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

      logger.info('Updated user balance', { userId, amount, newBalance, type });

      return updatedUser;
    });
  }

  static async banUser(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { isBanned: true },
    });
  }

  static async unbanUser(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { isBanned: false },
    });
  }

  /**
   * Search for a user by @username or Telegram ID string
   */
  static async findUserByUsernameOrId(query: string): Promise<User | null> {
    const cleanQuery = query.trim().replace(/^@/, '');

    // Check if numeric (Telegram ID)
    if (/^\d+$/.test(cleanQuery)) {
      const byTelegramId = await prisma.user.findUnique({
        where: { telegramId: BigInt(cleanQuery) },
      });
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
