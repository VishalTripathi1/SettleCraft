import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { transaction } from '../../db/pool.js';
import { ApiError } from '../../middleware/errors.js';
const webhookKey = createHmac('sha256', env.JWT_SECRET)
  .update('settlecraft-local-webhook-v1')
  .digest();
export function signature(timestamp: string, body: string) {
  return createHmac('sha256', webhookKey).update(`${timestamp}.${body}`).digest('hex');
}
export async function receive(timestamp: string, signed: string, body: string) {
  const now = Math.floor(Date.now() / 1000);
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 300)
    throw new ApiError(
      401,
      'EXPIRED_SIGNATURE',
      'Webhook timestamp is outside the five-minute window.',
    );
  if (
    !/^[a-f0-9]{64}$/.test(signed) ||
    !timingSafeEqual(Buffer.from(signature(timestamp, body), 'hex'), Buffer.from(signed, 'hex'))
  )
    throw new ApiError(401, 'INVALID_SIGNATURE', 'Webhook signature is invalid.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ApiError(422, 'INVALID_EVENT', 'Webhook body must be JSON.');
  }
  const data = z
    .object({ id: z.uuid(), type: z.string(), entityId: z.uuid() })
    .strict()
    .parse(parsed);
  const hash = createHash('sha256').update(body).digest('hex');
  return transaction(async (c) => {
    const event = await c.query(
      'SELECT id FROM outbox_events WHERE id=$1 AND type=$2 AND entity_id=$3',
      [data.id, data.type, data.entityId],
    );
    if (!event.rowCount) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Unknown local event.');
    const inserted = await c.query(
      'INSERT INTO webhook_receipts(event_id,payload_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id',
      [data.id, hash],
    );
    if (!inserted.rowCount) {
      const old = await c.query<{ payload_hash: string }>(
        'SELECT payload_hash FROM webhook_receipts WHERE event_id=$1',
        [data.id],
      );
      if (old.rows[0]!.payload_hash !== hash)
        throw new ApiError(
          409,
          'EVENT_CONFLICT',
          'Event payload does not match the first receipt.',
        );
      return { accepted: true, duplicate: true };
    }
    return { accepted: true, duplicate: false };
  });
}
export async function deliverOne(
  options: {
    send?: (timestamp: string, signed: string, body: string) => Promise<void>;
    crashAfterSend?: boolean;
  } = {},
) {
  return transaction(async (c) => {
    const event = (
      await c.query<{ id: string; type: string; entity_id: string; attempts: number }>(
        'SELECT * FROM outbox_events WHERE delivered_at IS NULL AND attempts<10 AND next_attempt_at<=now() ORDER BY created_at FOR NO KEY UPDATE SKIP LOCKED LIMIT 1',
      )
    ).rows[0];
    if (!event) return false;
    const body = JSON.stringify({ id: event.id, type: event.type, entityId: event.entity_id });
    const timestamp = String(Math.floor(Date.now() / 1000));
    let error: string | null = null;
    try {
      if (options.send) await options.send(timestamp, signature(timestamp, body), body);
      else {
        const response = await fetch(`http://127.0.0.1:${env.PORT}/api/v1/webhooks/demo-provider`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Timestamp': timestamp,
            'X-Webhook-Signature': signature(timestamp, body),
          },
          body,
          signal: AbortSignal.timeout(2500),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      }
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 120) : 'Delivery failed';
    }
    if (options.crashAfterSend && !error)
      throw new Error('Injected worker crash after receiver commit');
    const attempt = event.attempts + 1;
    await c.query(
      'INSERT INTO webhook_deliveries(event_id,attempt,status,error) VALUES($1,$2,$3,$4)',
      [event.id, attempt, error ? 'FAILED' : 'DELIVERED', error],
    );
    await c.query(
      "UPDATE outbox_events SET attempts=$2,last_error=$3,delivered_at=CASE WHEN $3::text IS NULL THEN now() ELSE NULL END,next_attempt_at=now()+($4::int*interval '1 second') WHERE id=$1",
      [event.id, attempt, error, Math.min(3600, 2 ** attempt)],
    );
    return true;
  });
}
