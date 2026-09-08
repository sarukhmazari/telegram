import type { IncomingMessage, ServerResponse } from 'http';
import { bot } from '../src/bot/index.js';
import { connectDatabase } from '../src/database/index.js';
import { config } from '../src/config/index.js';

export default async function handler(req: IncomingMessage & { body?: any; query?: any; method?: string }, res: ServerResponse & { status?: (code: number) => any; json?: (data: any) => any; send?: (data: any) => any }) {
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
    return sendJson(200, {
      status: 'ok',
      store: config.STORE_NAME,
      message: 'Telegram Digital Store Bot is running!',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method === 'POST') {
    try {
      await connectDatabase();

      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          // ignore
        }
      }

      if (body) {
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
