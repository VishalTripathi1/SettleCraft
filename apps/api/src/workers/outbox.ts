import { deliverOne } from '../modules/webhooks/service.js';
import { pool } from '../db/pool.js';
import pino from 'pino';
const logger = pino();
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
  });
while (!stopping) {
  try {
    if (await deliverOne()) continue;
  } catch {
    logger.error({ event: 'outbox_poll_failed' }, 'Outbox poll failed; retrying');
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
await pool.end();
