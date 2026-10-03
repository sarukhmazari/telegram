import type { IncomingMessage, ServerResponse } from 'http';
import { bot } from '../src/bot/index.js';
import { connectDatabase, prisma } from '../src/database/index.js';
import { config, configError } from '../src/config/index.js';
import { PaymentAccountService } from '../src/services/paymentAccountService.js';

// Polyfill BigInt JSON serialization for serverless responses and logs
if (typeof (BigInt.prototype as any).toJSON !== 'function') {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

// Disable automatic webhookReply so Telegraf does not prematurely close the HTTP response
// before database transactions, Telegram API messages, or delivery completions finish.
bot.telegram.webhookReply = false;

let isServerlessInitialized = false;

export default async function handler(
  req: IncomingMessage & { body?: any; query?: any; method?: string },
  res: ServerResponse & { status?: (code: number) => any; json?: (data: any) => any; send?: (data: any) => any }
) {
  const startTime = Date.now();

  // Helper for JSON response in serverless environments
  const sendJson = (statusCode: number, data: any) => {
    if (res.writableEnded) return;
    if (typeof res.status === 'function' && typeof res.json === 'function') {
      res.status(statusCode).json(data);
    } else {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    }
  };

  try {
    if (req.method === 'GET') {
      const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const shouldSetWebhook = urlObj.searchParams.get('setWebhook') === 'true';

      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const autoWebhookUrl = `${proto}://${host}/api`;

      let webhookAction: string | null = null;
      let webhookInfo: any = null;
      let dbCheck: any = 'checking...';

      // Test database connection
      try {
        await connectDatabase();
        await prisma.$queryRaw`SELECT 1`;
        dbCheck = '✅ Database connected successfully';
      } catch (dbErr: any) {
        dbCheck = `❌ Database connection error: ${dbErr?.message || String(dbErr)}`;
      }

      // Check / Set Webhook
      const hasValidToken = Boolean(config.BOT_TOKEN && !config.BOT_TOKEN.startsWith('0000000000:'));
      if (hasValidToken) {
        try {
          if (shouldSetWebhook && host) {
            await bot.telegram.setWebhook(autoWebhookUrl);
            webhookAction = `Webhook successfully registered to: ${autoWebhookUrl}`;
          }
          webhookInfo = await bot.telegram.getWebhookInfo();
        } catch (botErr: any) {
          webhookInfo = { error: botErr.message };
        }
      } else {
        webhookInfo = { error: 'BOT_TOKEN is missing or not configured in Vercel environment variables' };
      }

      return sendJson(200, {
        status: hasValidToken && !configError ? 'operational' : 'configuration_required',
        store: config.STORE_NAME || 'Digital Store',
        botTokenStatus: hasValidToken ? '✅ BOT_TOKEN configured' : '❌ BOT_TOKEN missing',
        databaseStatus: dbCheck,
        environmentValidation: configError
          ? { status: 'Missing required environment variables', details: configError }
          : '✅ All environment variables valid',
        webhookStatus: webhookInfo,
        webhookAction,
        suggestedWebhookUrl: autoWebhookUrl,
        instructions: !webhookInfo?.url
          ? `To connect Telegram webhook, visit: ${autoWebhookUrl}?setWebhook=true`
          : 'Telegram webhook is active and receiving updates.',
        responseTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    if (req.method === 'POST') {
      // 1. One-time cold-start initialization
      if (!isServerlessInitialized) {
        try {
          await connectDatabase();
          await PaymentAccountService.seedDefaultIfEmpty().catch(() => {});
          if (!bot.botInfo && config.BOT_TOKEN && !config.BOT_TOKEN.startsWith('0000000000:')) {
            bot.botInfo = await bot.telegram.getMe().catch((meErr) => {
              console.warn('Unable to pre-fetch bot.botInfo on cold start:', meErr?.message);
              return undefined as any;
            });
          }
          isServerlessInitialized = true;
        } catch (initErr) {
          console.error('Cold-start initialization error:', initErr);
        }
      }

      // 2. Extract request body reliably (handles parsed object, string, or raw buffer stream)
      let body = req.body;

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          // Keep as raw string if JSON parsing fails
        }
      }

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

      // 3. Process update directly without passing response to avoid early teardown
      if (body && typeof body === 'object') {
        const updateType = body.callback_query ? `callback:${body.callback_query.data}` : body.message ? 'message' : 'other';
        const updateStart = Date.now();
        await bot.handleUpdate(body);
        const duration = Date.now() - updateStart;
        if (duration > 500) {
          console.log(`⏱️ Update [${updateType}] processed in ${duration}ms`);
        }
      }

      return sendJson(200, { ok: true });
    }

    return sendJson(405, { error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Unhandled error in serverless handler:', err);
    return sendJson(200, {
      ok: false,
      error: err?.message || 'Server error occurred',
      timestamp: new Date().toISOString(),
    });
  }
}


