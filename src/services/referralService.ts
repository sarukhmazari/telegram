import { prisma } from '../database/index.js';
import { UserService } from './userService.js';
import { TransactionType } from '@prisma/client';
import { logger } from '../utils/logger.js';

export class ReferralService {
  static async processFirstPurchaseReward(referredUserId: string, orderTotal: number, rewardPercentage: number = 5): Promise<boolean> {
    const referral = await prisma.referral.findUnique({
      where: { referredId: referredUserId },
    });

    if (!referral || referral.isRewarded) {
      return false;
    }

    const rewardAmount = (orderTotal * rewardPercentage) / 100;
    if (rewardAmount <= 0) return false;

    await prisma.$transaction(async (tx) => {
      await tx.referral.update({
        where: { id: referral.id },
        data: {
          rewardAmount,
          isRewarded: true,
        },
      });

      // Add balance to referrer
      await UserService.updateBalance(
        referral.referrerId,
        rewardAmount,
        TransactionType.ADMIN_CREDIT,
        `Referral reward for customer purchase #${referredUserId}`,
        referral.id
      );
    });

    logger.info('Processed referral purchase reward', { referrerId: referral.referrerId, rewardAmount });
    return true;
  }
}
