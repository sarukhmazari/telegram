import crypto from 'crypto';
import { config } from '../config/index.js';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // For GCM
const AUTH_TAG_LENGTH = 16;
// Derive a static 32-byte key from config.ENCRYPTION_KEY
const KEY = crypto.createHash('sha256').update(config.ENCRYPTION_KEY).digest();
/**
 * Encrypt a string using AES-256-GCM
 */
export function encryptData(text) {
    if (!text)
        return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}
/**
 * Decrypt an AES-256-GCM encrypted string
 */
export function decryptData(encryptedPayload) {
    if (!encryptedPayload)
        return encryptedPayload;
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
        // If not in encrypted format, return as is (fallback for legacy or unencrypted text)
        return encryptedPayload;
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
