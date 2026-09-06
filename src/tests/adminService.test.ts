import { describe, it, expect, vi } from 'vitest';
import { AdminService } from '../services/adminService.js';
import { prisma } from '../database/index.js';

vi.mock('../database/index.js', () => ({
  prisma: {
    stockItem: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe('AdminService Unit Tests', () => {
  it('should parse multiline stock input and detect empty lines', async () => {
    (prisma.stockItem.findFirst as any).mockResolvedValue(null);
    (prisma.stockItem.create as any).mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'stk-1', ...data })
    );

    const lines = [
      'acc1@example.com:pass1',
      '',
      '   ',
      'acc2@example.com:pass2',
    ];

    const result = await AdminService.importBulkStock('var-1', lines);
    expect(result.importedCount).toBe(2);
    expect(result.invalidCount).toBe(2);
  });
});
