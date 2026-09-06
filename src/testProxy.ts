import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from './config/index.js';

async function testConnection() {
  const proxy = process.env.HTTPS_PROXY || 'http://127.0.0.1:59555';
  console.log(`🔍 Testing Telegram API connection via proxy: ${proxy}`);

  const agent = new HttpsProxyAgent(proxy);

  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.telegram.org/bot${config.BOT_TOKEN}/getMe`,
      { agent },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          console.log(`✅ Response Code: ${res.statusCode}`);
          console.log(`📦 Response Body: ${data}`);
          resolve(data);
        });
      }
    );

    req.on('error', (err) => {
      console.error(`❌ Connection Error: ${err.message}`);
      reject(err);
    });

    req.setTimeout(10000, () => {
      console.error('❌ Request Timed Out (10s)');
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

testConnection().catch(() => process.exit(1));
