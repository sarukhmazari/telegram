import type { IncomingMessage, ServerResponse } from 'http';
import { bot } from '../src/bot/index.js';
import { connectDatabase } from '../src/database/index.js';
import { config, configError } from '../src/config/index.js';
import { PaymentAccountService } from '../src/services/paymentAccountService.js';

// Polyfill BigInt JSON serialization for serverless responses and logs
if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

export default async function handler(
  req: IncomingMessage & { body?: any; query?: any; method?: string },
  res: ServerResponse & { status?: (code: number) => any; json?: (data: any) => any; send?: (data: any) => any }
) {
  // Helper for JSON response in serverless environments
  const sendJson = (statusCode: number, data: any) => {
    if (res.status) {
      res.status(statusCode).json(data);
    } else {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    }
  };

  if (req.method === 'GET') {
    try {
      const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const shouldSetWebhook = urlObj.searchParams.get('setWebhook') === 'true';

      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const autoWebhookUrl = `${proto}://${host}/api`;

      let webhookAction = null;
      if (shouldSetWebhook && host) {
        await bot.telegram.setWebhook(autoWebhookUrl);
        webhookAction = `Webhook successfully set to ${autoWebhookUrl}`;
      }

      const webhookInfo: any = await bot.telegram.getWebhookInfo().catch((e) => ({ error: e.message }));

      return sendJson(200, {
        status: 'ok',
        store: config.STORE_NAME,
        message: 'Telegram Digital Store Bot is running on Vercel!',
        environmentCheck: configError
          ? { error: 'Missing or invalid environment variables on Vercel', details: configError }
          : 'Environment variables valid',
        webhookAction,
        currentWebhookInfo: webhookInfo,
        suggestedWebhookUrl: autoWebhookUrl,
        instructions: !webhookInfo?.url
          ? `Visit this URL with ?setWebhook=true to connect Telegram to this Vercel domain.`
          : 'Telegram webhook is active!',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return sendJson(500, { error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      // 1. Connect database safely and seed default payment accounts if first run
      await connectDatabase().catch((dbErr) => {
        console.error('Database connection error in serverless handler:', dbErr);
        throw dbErr;
      });
      await PaymentAccountService.seedDefaultIfEmpty().catch(() => {});

      // 2. Ensure botInfo is populated for Telegraf command routing in serverless
      if (!bot.botInfo) {
        try {
          bot.botInfo = await bot.telegram.getMe();
        } catch (meErr: any) {
          console.warn('Unable to pre-fetch bot.botInfo on cold start:', meErr?.message);
        }
      }

      // 3. Extract request body reliably (handles object, string, or raw stream)
      let body = req.body;

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          // keep as raw string if JSON parsing fails
        }
      }

      // If req.body is missing or empty object without update properties, read raw stream
      if (!body || (typeof body === 'object' && !('update_id' in body) && Object.keys(body).length === 0)) {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          const raw = Buffer.concat(chunks).toString('utf-8');
          if (raw) {
            body = JSON.parse(raw);
          }
        } catch (streamErr) {
          console.error('Error reading raw request stream body:', streamErr);
        }
      }

      // 4. Process update if valid object
      if (body && typeof body === 'object' && ('update_id' in body || 'message' in body || 'callback_query' in body)) {
        await bot.handleUpdate(body, res);
      } else if (body && typeof body === 'object') {
        // Fallback for custom or nested update structures
        await bot.handleUpdate(body, res);
      }

      if (!res.writableEnded) {
        return sendJson(200, { ok: true });
      }
    } catch (err: any) {
      console.error('Error handling Telegram webhook update:', err);
      if (!res.writableEnded) {
        return sendJson(500, { error: err?.message || 'Internal Server Error' });
      }
    }
    return;
  }

  return sendJson(405, { error: 'Method not allowed' });
}

