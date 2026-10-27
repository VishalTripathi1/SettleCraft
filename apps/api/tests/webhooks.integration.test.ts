import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { receive, signature, deliverOne } from '../src/modules/webhooks/service.js';
beforeAll(async () => {
  await migrate();
  await pool.query(
    "UPDATE outbox_events SET next_attempt_at=now()+interval '1 day' WHERE delivered_at IS NULL",
  );
});
afterAll(() => pool.end());
it('authenticates webhooks, deduplicates receipts, and rejects expired or altered signatures', async () => {
  const id = randomUUID(),
    entityId = randomUUID();
  await pool.query(
    "INSERT INTO outbox_events(id,type,entity_id,payload,next_attempt_at) VALUES($1,'test.event',$2,'{}',now()+interval '1 day')",
    [id, entityId],
  );
  const body = JSON.stringify({ id, type: 'test.event', entityId });
  const ts = String(Math.floor(Date.now() / 1000));
  expect(await receive(ts, signature(ts, body), body)).toEqual({
    accepted: true,
    duplicate: false,
  });
  expect(await receive(ts, signature(ts, body), body)).toEqual({ accepted: true, duplicate: true });
  await expect(receive(ts, '0'.repeat(64), body)).rejects.toMatchObject({ status: 401 });
  await expect(receive('1000000000', signature('1000000000', body), body)).rejects.toMatchObject({
    status: 401,
  });
});
it('a worker crash after receiver commit retries without processing the event twice', async () => {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO outbox_events(id,type,entity_id,payload) VALUES($1,'test.crash',$2,'{}')",
    [id, randomUUID()],
  );
  const send = async (t: string, s: string, b: string) => {
    await receive(t, s, b);
  };
  await expect(deliverOne({ send, crashAfterSend: true })).rejects.toThrow('Injected worker crash');
  expect(
    (await pool.query('SELECT delivered_at FROM outbox_events WHERE id=$1', [id])).rows[0]
      .delivered_at,
  ).toBeNull();
  await deliverOne({ send });
  expect(
    (await pool.query('SELECT count(*)::int AS n FROM webhook_receipts WHERE event_id=$1', [id]))
      .rows[0].n,
  ).toBe(1);
  expect(
    (await pool.query('SELECT delivered_at FROM outbox_events WHERE id=$1', [id])).rows[0]
      .delivered_at,
  ).not.toBeNull();
});
it('backs off failed deliveries without touching financial journals', async () => {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO outbox_events(id,type,entity_id,payload) VALUES($1,'test.failure',$2,'{}')",
    [id, randomUUID()],
  );
  const before = (await pool.query('SELECT count(*) FROM ledger_journals')).rows[0].count;
  await deliverOne({
    send: async () => {
      throw new Error('Simulated receiver outage');
    },
  });
  const e = (await pool.query('SELECT * FROM outbox_events WHERE id=$1', [id])).rows[0];
  expect(e.attempts).toBe(1);
  expect(e.delivered_at).toBeNull();
  expect(new Date(e.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
  expect((await pool.query('SELECT count(*) FROM ledger_journals')).rows[0].count).toBe(before);
});
