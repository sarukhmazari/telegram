import { describe, it, expect } from 'vitest';
import { encryptData, decryptData } from '../utils/crypto.js';

describe('Crypto Utility', () => {
  it('should encrypt and decrypt string accurately', () => {
    const originalText = 'my_secret_netflix_account:password123';
    const encrypted = encryptData(originalText);

    expect(encrypted).not.toEqual(originalText);
    expect(encrypted.split(':').length).toBe(3);

    const decrypted = decryptData(encrypted);
    expect(decrypted).toEqual(originalText);
  });

  it('should handle empty or null values gracefully', () => {
    expect(encryptData('')).toBe('');
    expect(decryptData('')).toBe('');
  });
});
