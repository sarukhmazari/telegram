import http from 'http';
import handler from './index.js';
import { config } from '../src/config/index.js';

const PORT = parseInt(process.env.PORT || String(config.PORT || 3000), 10);

const server = http.createServer((req, res) => {
  handler(req as any, res as any);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Store Bot Server listening on port ${PORT}`);
});
