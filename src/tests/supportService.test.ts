import { describe, it, expect } from 'vitest';
import { SupportService } from '../services/supportService.js';
import { ReviewService } from '../services/reviewService.js';

describe('Phase 8 Services Unit Tests', () => {
  it('should generate ticket number correctly', () => {
    const ticketNum = SupportService.generateTicketNumber();
    expect(ticketNum).toMatch(/^TCK-[A-Z0-9]{6}$/);
  });
});
