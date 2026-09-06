import { describe, it, expect } from 'vitest';
import { encryptData, decryptData } from '../utils/crypto.js';

describe('DeliveryService Stock Encryption & Decryption', () => {
  it('should encrypt stock payload before DB insert and decrypt upon delivery', () => {
    const rawCredentials = 'user1@netflix.com:SecretPass123!';
    const encrypted = encryptData(rawCredentials);
    expect(encrypted).not.toBe(rawCredentials);

    const decrypted = decryptData(encrypted);
    expect(decrypted).toBe(rawCredentials);
  });
});
