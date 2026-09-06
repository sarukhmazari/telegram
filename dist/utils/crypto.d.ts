/**
 * Encrypt a string using AES-256-GCM
 */
export declare function encryptData(text: string): string;
/**
 * Decrypt an AES-256-GCM encrypted string
 */
export declare function decryptData(encryptedPayload: string): string;
