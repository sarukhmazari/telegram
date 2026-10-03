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
  'deliverydata',
  'encryptionkey',
];

function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED_SECRET]';
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const sanitizeFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key !== 'level' && key !== 'message' && key !== 'timestamp') {
      if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk))) {
        info[key] = '[REDACTED_SECRET]';
      } else if (typeof info[key] === 'object' && info[key] !== null) {
        info[key] = sanitizeObject(info[key]);
      }
    }
  }
  return info;
});

export const logger = winston.createLogger({
  level: config.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    sanitizeFormat()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const cleanMeta: Record<string, any> = {};
          for (const key of Object.keys(meta)) {
            cleanMeta[key] = meta[key];
          }
          const metaStr = Object.keys(cleanMeta).length ? ` ${JSON.stringify(cleanMeta)}` : '';
          return `[${timestamp}] ${level}: ${message}${metaStr}`;
        })
      ),
    }),
  ],
});

