import { TransactionType, User } from '@prisma/client';
export declare class UserService {
    /**
     * Find existing user or auto-register a new Telegram user.
     */
    static findOrCreateUser(telegramId: number | bigint, username?: string, firstName?: string, lastName?: string, referralCodeArg?: string): Promise<User>;
    static getUserByTelegramId(telegramId: number | bigint): Promise<User | null>;
    static getUserById(id: string): Promise<User | null>;
    /**
     * Safe transaction-backed wallet balance modification
     */
    static updateBalance(userId: string, amount: number, type: TransactionType, description: string, referenceId?: string): Promise<User>;
    static banUser(userId: string): Promise<User>;
    static unbanUser(userId: string): Promise<User>;
}
