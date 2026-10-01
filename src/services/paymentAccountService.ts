import { prisma } from '../database/index.js';
import { logger } from '../utils/logger.js';
import { PaymentAccount } from '@prisma/client';

let cachedActiveAccounts: PaymentAccount[] | null = null;
let cachedActiveAccountsTime = 0;
let cachedAllAccounts: PaymentAccount[] | null = null;
let cachedAllAccountsTime = 0;
const ACCOUNT_CACHE_TTL_MS = 60 * 1000; // 60 seconds

export class PaymentAccountService {
  static invalidateCache() {
    cachedActiveAccounts = null;
    cachedActiveAccountsTime = 0;
    cachedAllAccounts = null;
    cachedAllAccountsTime = 0;
  }

  /**
   * Return all payment accounts ordered by position / creation
   */
  static async getAllAccounts(): Promise<PaymentAccount[]> {
    const now = Date.now();
    if (cachedAllAccounts && now - cachedAllAccountsTime < ACCOUNT_CACHE_TTL_MS) {
      return cachedAllAccounts;
    }

    const accounts = await prisma.paymentAccount.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    cachedAllAccounts = accounts;
    cachedAllAccountsTime = now;
    return accounts;
  }

  /**
   * Return enabled payment accounts for customer checkout
   */
  static async getActiveAccounts(): Promise<PaymentAccount[]> {
    const now = Date.now();
    if (cachedActiveAccounts && now - cachedActiveAccountsTime < ACCOUNT_CACHE_TTL_MS) {
      return cachedActiveAccounts;
    }

    const accounts = await prisma.paymentAccount.findMany({
      where: { isEnabled: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    cachedActiveAccounts = accounts;
    cachedActiveAccountsTime = now;
    return accounts;
  }

  /**
   * Get single account by ID
   */
  static async getAccountById(id: string): Promise<PaymentAccount | null> {
    return prisma.paymentAccount.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new payment account
   */
  static async createAccount(data: {
    providerName: string;
    accountNumber: string;
    accountTitle: string;
    instructions?: string;
  }): Promise<PaymentAccount> {
    PaymentAccountService.invalidateCache();
    const count = await prisma.paymentAccount.count();
    const created = await prisma.paymentAccount.create({
      data: {
        providerName: data.providerName.trim(),
        accountNumber: data.accountNumber.trim(),
        accountTitle: data.accountTitle.trim(),
        instructions: data.instructions ? data.instructions.trim() : null,
        position: count,
        isEnabled: true,
      },
    });

    logger.info('Payment account created', { accountId: created.id, provider: created.providerName });
    return created;
  }

  /**
   * Update payment account details
   */
  static async updateAccount(
    id: string,
    data: Partial<{
      providerName: string;
      accountNumber: string;
      accountTitle: string;
      instructions: string | null;
      isEnabled: boolean;
    }>
  ): Promise<PaymentAccount> {
    PaymentAccountService.invalidateCache();
    const updated = await prisma.paymentAccount.update({
      where: { id },
      data,
    });
    logger.info('Payment account updated', { accountId: id, data });
    return updated;
  }

  /**
   * Toggle enabled / disabled status
   */
  static async toggleAccount(id: string): Promise<PaymentAccount> {
    PaymentAccountService.invalidateCache();
    const current = await this.getAccountById(id);
    if (!current) throw new Error('Payment account not found');

    return this.updateAccount(id, { isEnabled: !current.isEnabled });
  }

  /**
   * Delete a payment account
   */
  static async deleteAccount(id: string): Promise<PaymentAccount> {
    PaymentAccountService.invalidateCache();
    const deleted = await prisma.paymentAccount.delete({
      where: { id },
    });
    logger.info('Payment account deleted', { accountId: id });
    return deleted;
  }

  /**
   * Seed initial payment account if database is empty
   */
  static async seedDefaultIfEmpty(): Promise<void> {
    try {
      const count = await prisma.paymentAccount.count();
      if (count === 0) {
        await prisma.paymentAccount.create({
          data: {
            providerName: 'JazzCash',
            accountNumber: '03292823218',
            accountTitle: 'SARIKH MUREED',
            instructions:
              'After completing the transfer, please reply directly to this chat with your 12-digit JazzCash Transaction ID (TRX ID) or send a screenshot of the payment receipt.',
            isEnabled: true,
            position: 0,
          },
        });
        PaymentAccountService.invalidateCache();
        logger.info('✅ Initial default JazzCash payment account seeded.');
      }
    } catch (err: any) {
      logger.warn('Could not seed default payment account (will retry on next startup)', { error: err.message });
    }
  }
}
