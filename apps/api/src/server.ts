import { createApp, logger } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
const server = createApp().listen(env.PORT, '127.0.0.1', () =>
  logger.info({ port: env.PORT }, 'SettleCraft API listening'),
);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
