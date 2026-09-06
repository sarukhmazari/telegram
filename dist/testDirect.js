import https from 'https';
import { config } from './config/index.js';
async function testDirect() {
    console.log(`🔍 Testing DIRECT connection to Telegram API (no proxy)...`);
    return new Promise((resolve, reject) => {
        const req = https.get(`https://api.telegram.org/bot${config.BOT_TOKEN}/getMe`, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                console.log(`✅ Direct Response Code: ${res.statusCode}`);
                console.log(`📦 Response Body: ${data}`);
                resolve(data);
            });
        });
        req.on('error', (err) => {
            console.error(`❌ Direct Connection Error: ${err.message}`);
            reject(err);
        });
        req.setTimeout(8000, () => {
            console.error('❌ Direct Request Timed Out (8s)');
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}
testDirect().catch(() => process.exit(1));
