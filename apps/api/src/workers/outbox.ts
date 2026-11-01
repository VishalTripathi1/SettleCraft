import { expirePendingVerifications } from '../modules/verification/expiry.js';
import { processQueuedReversals } from '../modules/reversals/queue.js';
import { deliverOne } from '../modules/webhooks/service.js';
import { pool } from '../db/pool.js';
import pino from 'pino';
const logger = pino();
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
  });
logger.info(
  { event: 'maintenance_started' },
  'Refund, verification expiry and webhook worker started',
);
while (!stopping) {
  let work = 0;
  // A provider/outbox failure must not stop refunds or payment expiration.
  for (const [event, job] of [
    ['verification_expiry', expirePendingVerifications],
    ['queued_refunds', processQueuedReversals],
    ['webhook_delivery', deliverOne],
  ] as const) {
    try {
      work += Number(await job());
    } catch {
      logger.error({ event: `${event}_failed` }, 'Background task failed; retrying');
    }
  }
  if (!work) await new Promise((resolve) => setTimeout(resolve, 2000));
}
await pool.end();
