import { prisma } from '../database/index.js';
import { SupportTicket, TicketMessage, TicketStatus, SenderType } from '@prisma/client';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

export class SupportService {
  static generateTicketNumber(): string {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `TCK-${randomHex}`;
  }

  static async createTicket(userId: string, subject: string, initialMessage: string, fileId?: string) {
    const ticketNumber = this.generateTicketNumber();

    return prisma.supportTicket.create({
      data: {
        ticketNumber,
        userId,
        subject,
        status: TicketStatus.OPEN,
        messages: {
          create: [
            {
              senderId: userId,
              senderType: SenderType.USER,
              text: initialMessage,
              fileId: fileId || null,
            },
          ],
        },
      },
      include: { messages: true, user: true },
    });
  }

  static async addMessage(ticketId: string, senderId: string, senderType: SenderType, text: string, fileId?: string) {
    const message = await prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId,
        senderType,
        text,
        fileId: fileId || null,
      },
    });

    const newStatus = senderType === SenderType.USER ? TicketStatus.OPEN : TicketStatus.WAITING;

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: newStatus },
    });

    return message;
  }
}
