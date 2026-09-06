import { SenderType } from '@prisma/client';
export declare class SupportService {
    static generateTicketNumber(): string;
    static createTicket(userId: string, subject: string, initialMessage: string, fileId?: string): Promise<{
        user: {
            id: string;
            telegramId: bigint;
            username: string | null;
            referralCode: string;
            firstName: string | null;
            lastName: string | null;
            balance: import("@prisma/client/runtime/library").Decimal;
            role: import("@prisma/client").$Enums.Role;
            isBanned: boolean;
            referredById: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
        messages: {
            id: string;
            createdAt: Date;
            text: string;
            fileId: string | null;
            senderId: string;
            senderType: import("@prisma/client").$Enums.SenderType;
            ticketId: string;
        }[];
    } & {
        status: import("@prisma/client").$Enums.TicketStatus;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        ticketNumber: string;
        subject: string;
    }>;
    static addMessage(ticketId: string, senderId: string, senderType: SenderType, text: string, fileId?: string): Promise<{
        id: string;
        createdAt: Date;
        text: string;
        fileId: string | null;
        senderId: string;
        senderType: import("@prisma/client").$Enums.SenderType;
        ticketId: string;
    }>;
}
