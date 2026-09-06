import winston from 'winston';
import { config } from '../config/index.js';
// Sensitive keys to sanitize from log payloads
const SENSITIVE_KEYS = [
    'password',
    'secret',
    'token',
    'content',
    'credentials',
    'key',
    'deliveryData',
    'encryptionKey',
];
function sanitizeObject(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (typeof obj !== 'object')
        return obj;
    if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
    }
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk))) {
            sanitized[key] = '[REDACTED_SECRET]';
        }
        else if (typeof value === 'object') {
            sanitized[key] = sanitizeObject(value);
        }
        else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}
const sanitizeFormat = winston.format((info) => {
    return sanitizeObject(info);
});
export const logger = winston.createLogger({
    level: config.LOG_LEVEL,
    format: winston.format.combine(winston.format.timestamp(), sanitizeFormat(), winston.format.json()),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
                return `[${timestamp}] ${level}: ${message} ${metaStr}`;
            })),
        }),
    ],
});
