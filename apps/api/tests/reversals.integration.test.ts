import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { User } from '@settlecraft/shared';
import { pool, transaction } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { provision } from '../src/modules/ledger/service.js';
import { transfer, reverse } from '../src/modules/transfers/service.js';
import { submitRequest, decideRequest } from '../src/modules/reversals/service.js';
import { history } from '../src/modules/reversals/routes.js';
import { reconcile } from '../src/modules/admin/service.js';
import { session } from '../src/modules/auth/service.js';
import { processQueuedReversals } from '../src/modules/reversals/queue.js';
import { requestTopup, decideTopup } from '../src/modules/admin/service.js';
import { createApp } from '../src/app.js';
let admin: string;
const app = createApp();
async function user(amount = 0n, role = 'USER') {
  return transaction(async (c) => {
    const u = (
      await c.query(
        "INSERT INTO users(name,email,password_hash,role,created_at) VALUES('Reversal Test',$1,'test-only',$2,now()-interval '2 days') RETURNING id",
        [`${randomUUID()}@example.com`, role],
      )
    ).rows[0];
    await provision(c, u.id, amount);
    return u.id as string;
  });
}
async function auth(id: string) {
  const u = (await pool.query<User>('SELECT id,name,email,role FROM users WHERE id=$1', [id]))
    .rows[0]!;
  return `Bearer ${(await transaction((c) => session(c, u))).accessToken}`;
}
async function balance(id: string) {
  return (await pool.query('SELECT balance FROM wallet_balances WHERE owner_id=$1', [id])).rows[0]
    .balance;
}
async function fixture() {
  const a = await user(200000n),
    b = await user();
  const t = await transfer(
    a,
    randomUUID(),
    { recipientId: b, amount: '1000', currency: 'INR', note: 'Reversal fixture' },
    'test',
  );
  return { a, b, t };
}
const body = { reason: 'MISTAKE', notes: 'Made by mistake' };
beforeAll(async () => {
  await migrate();
  admin = await user(0n, 'ADMIN');
});
afterAll(() => pool.end());
it('completes the full request, approval, history, ledger and reconciliation workflow exactly once', async () => {
  const { a, b, t } = await fixture();
  const key = randomUUID();
  const r = await submitRequest(a, t.id, key, body, 'test');
  expect(r.status).toBe('PENDING');
  expect((await submitRequest(a, t.id, key, body, 'retry')).id).toBe(r.id);
  expect(await balance(a)).toBe('100000');
  expect(await balance(b)).toBe('100000');
  const decisions = await Promise.all(
    Array.from({ length: 8 }, () =>
      decideRequest(admin, r.id, 'APPROVE', 'Approve requested correction', 'test'),
    ),
  );
  expect(decisions.every((d) => d.status === 'APPROVED')).toBe(true);
  expect(new Set(decisions.map((d) => d.reversal_id)).size).toBe(1);
  expect(await balance(a)).toBe('200000');
  expect(await balance(b)).toBe('0');
  for (const [actor, direction, signed] of [
    [a, 'INCOMING', '100000'],
    [b, 'OUTGOING', '-100000'],
  ]) {
    const h = await history({}, actor!);
    expect(h.total).toBe(2);
    expect(h.items[0]).toMatchObject({
      type: 'REVERSAL',
      direction,
      signed_amount: signed,
      transfer_id: t.id,
      request_id: r.id,
      status: 'COMPLETED',
    });
    expect(h.items[1]).toMatchObject({ type: 'TRANSFER', id: t.id });
  }
  const rev = decisions[0].reversal_id;
  const journal = (await pool.query('SELECT * FROM reversals WHERE id=$1', [rev])).rows[0];
  const entries = (
    await pool.query('SELECT direction,amount::text FROM ledger_entries WHERE journal_id=$1', [
      journal.journal_id,
    ])
  ).rows;
  expect(entries).toEqual(
    expect.arrayContaining([
      { direction: 'DEBIT', amount: '100000' },
      { direction: 'CREDIT', amount: '100000' },
    ]),
  );
  const audit = (
    await pool.query('SELECT action FROM audit_events WHERE entity_id=$1', [r.id])
  ).rows.map((x) => x.action);
  expect(audit).toContain('REVERSAL_REQUEST_SUBMITTED');
  expect(audit).toContain('REVERSAL_REQUEST_APPROVED');
  expect((await reconcile(admin, 'reversal-test')).passed).toBe(true);
});
it('prevents concurrent active requests and validates sender ownership and eligibility', async () => {
  const { a, b, t } = await fixture(),
    other = await user();
  for (const actor of [b, other])
    await expect(submitRequest(actor, t.id, randomUUID(), body, 'test')).rejects.toMatchObject({
      status: 404,
    });
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => submitRequest(a, t.id, randomUUID(), body, 'test')),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const pending = await transfer(
    a,
    randomUUID(),
    { recipientId: b, amount: '10000', currency: 'INR', note: '' },
    'test',
  );
  await expect(submitRequest(a, pending.id, randomUUID(), body, 'test')).rejects.toMatchObject({
    status: 409,
  });
  await reverse(admin, t.id, randomUUID(), 'Independent admin correction', 'test');
  await expect(submitRequest(a, t.id, randomUUID(), body, 'test')).rejects.toMatchObject({
    status: 409,
  });
});
it('rejects without moving money, replays the decision, and permits a fresh request after rejection', async () => {
  const { a, b, t } = await fixture();
  const r = await submitRequest(a, t.id, randomUUID(), body, 'test');
  const rejected = await decideRequest(
    admin,
    r.id,
    'REJECT',
    'Not enough supporting information',
    'test',
  );
  expect(rejected.status).toBe('REJECTED');
  expect((await decideRequest(admin, r.id, 'REJECT', 'Retry same decision', 'test')).id).toBe(r.id);
  expect(await balance(a)).toBe('100000');
  expect(await balance(b)).toBe('100000');
  expect((await history({ type: 'REVERSAL' }, a)).total).toBe(0);
  expect((await submitRequest(a, t.id, randomUUID(), body, 'test')).status).toBe('PENDING');
});
it('queues insufficient funds and records frozen wallet failures without financial postings', async () => {
  for (const mode of ['spent', 'frozen']) {
    const { a, b, t } = await fixture();
    const r = await submitRequest(a, t.id, randomUUID(), body, 'test');
    if (mode === 'spent')
      await transfer(
        b,
        randomUUID(),
        { recipientId: await user(), amount: '1000', currency: 'INR', note: '' },
        'test',
      );
    else await pool.query("UPDATE wallets SET status='FROZEN' WHERE owner_id=$1", [b]);
    const decided = await decideRequest(
      admin,
      r.id,
      'APPROVE',
      'Approve after checking request',
      'test',
    );
    expect(decided.status).toBe(mode === 'spent' ? 'QUEUED' : 'FAILED');
    if (mode === 'frozen') expect(decided.failure_reason).toMatch(/active/);
    else expect(decided.failure_reason).toBeNull();
    expect(decided.reversal_id).toBeNull();
    expect((await history({ type: 'REVERSAL' }, a)).total).toBe(0);
    expect(await balance(a)).toBe('100000');
  }
});
it('serializes competing approval/rejection and direct reversals without stale requests', async () => {
  const { a, t } = await fixture();
  const r = await submitRequest(a, t.id, randomUUID(), body, 'test');
  const race = await Promise.allSettled([
    decideRequest(admin, r.id, 'APPROVE', 'Approved by one reviewer', 'test'),
    decideRequest(admin, r.id, 'REJECT', 'Rejected by other reviewer', 'test'),
  ]);
  expect(race.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  const second = await fixture();
  const q = await submitRequest(second.a, second.t.id, randomUUID(), body, 'test');
  await Promise.allSettled([
    reverse(admin, second.t.id, randomUUID(), 'Direct administrator reversal', 'test'),
    decideRequest(admin, q.id, 'APPROVE', 'Requested administrator reversal', 'test'),
  ]);
  const saved = (await pool.query('SELECT * FROM reversal_requests WHERE id=$1', [q.id])).rows[0];
  expect(saved.status).toBe('APPROVED');
  expect(saved.reversal_id).toBeTruthy();
  expect(
    (await pool.query('SELECT id FROM reversals WHERE transfer_id=$1', [second.t.id])).rowCount,
  ).toBe(1);
});
it('direct admin reversal resolves pending requests and emits an audit event', async () => {
  const { a, t } = await fixture();
  const r = await submitRequest(a, t.id, randomUUID(), body, 'test');
  const rev = await reverse(
    admin,
    t.id,
    randomUUID(),
    'Direct review while request pending',
    'test',
  );
  expect(
    (await pool.query('SELECT status,reversal_id FROM reversal_requests WHERE id=$1', [r.id]))
      .rows[0],
  ).toEqual({ status: 'APPROVED', reversal_id: rev.id });
  expect(
    (
      await pool.query(
        "SELECT id FROM audit_events WHERE entity_id=$1 AND action='REVERSAL_REQUEST_RESOLVED'",
        [r.id],
      )
    ).rowCount,
  ).toBe(1);
});
it('API enforces authentication, RBAC, privacy, validation, admin visibility and request filters', async () => {
  const { a, b, t } = await fixture();
  const token = await auth(a),
    adminToken = await auth(admin),
    recipientToken = await auth(b);
  expect(
    (await request(app).post(`/api/v1/transfers/${t.id}/reversal-requests`).send(body)).status,
  ).toBe(401);
  const r = (
    await request(app)
      .post(`/api/v1/transfers/${t.id}/reversal-requests`)
      .set('Authorization', token)
      .set('Idempotency-Key', randomUUID())
      .send(body)
  ).body;
  expect(r.status).toBe('PENDING');
  expect(
    (
      await request(app)
        .get(`/api/v1/reversal-requests/${r.id}`)
        .set('Authorization', recipientToken)
    ).status,
  ).toBe(404);
  expect(
    (await request(app).get('/api/v1/admin/reversal-requests').set('Authorization', token)).status,
  ).toBe(403);
  expect(
    (
      await request(app)
        .post(`/api/v1/admin/reversal-requests/${r.id}/decision`)
        .set('Authorization', adminToken)
        .send({ decision: 'REJECT', rationale: '' })
    ).status,
  ).toBe(422);
  const listed = await request(app)
    .get(`/api/v1/admin/reversal-requests?search=${t.reference}&status=PENDING`)
    .set('Authorization', adminToken);
  expect(listed.body.total).toBe(1);
  expect(
    (await request(app).get(`/api/v1/reversal-requests/${r.id}`).set('Authorization', token)).body
      .notes,
  ).toBe(body.notes);
  await decideRequest(admin, r.id, 'APPROVE', 'API approved request test', 'test');
  expect(
    (
      await request(app)
        .get(`/api/v1/admin/history?search=${t.reference}`)
        .set('Authorization', adminToken)
    ).body.total,
  ).toBe(2);
  const stranger = await auth(await user());
  expect(
    (await request(app).get(`/api/v1/history?search=${t.reference}`).set('Authorization', stranger))
      .body.total,
  ).toBe(0);
  const reversal = (await history({ type: 'REVERSAL' }, a)).items[0];
  expect(
    (await request(app).get(`/api/v1/reversals/${reversal.id}`).set('Authorization', stranger))
      .status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .get(`/api/v1/reversals/${reversal.id}`)
        .set('Authorization', recipientToken)
    ).body.request_id,
  ).toBeNull();
});
it('paginates the combined result, sorts by each posting time, and filters without losing counts on empty pages', async () => {
  const a = await user(100000n),
    b = await user();
  for (let i = 0; i < 12; i++) {
    const t = await transfer(
      a,
      randomUUID(),
      { recipientId: b, amount: '1', currency: 'INR', note: '' },
      'test',
    );
    await reverse(admin, t.id, randomUUID(), 'History pagination fixture', 'test');
  }
  const first = await history({}, a),
    second = await history({ page: 2 }, a),
    empty = await history({ page: 3 }, a);
  expect(first.total).toBe(24);
  expect(first.items).toHaveLength(20);
  expect(second.items).toHaveLength(4);
  expect(empty.total).toBe(24);
  expect(empty.items).toHaveLength(0);
  const all = [...first.items, ...second.items];
  expect(new Set(all.map((r) => r.history_id)).size).toBe(24);
  expect(all.map((r) => Date.parse(r.created_at))).toEqual(
    all.map((r) => Date.parse(r.created_at)).sort((x, y) => y - x),
  );
  expect(
    (await history({ type: 'REVERSAL', direction: 'INCOMING', status: 'COMPLETED' }, a)).total,
  ).toBe(12);
  expect((await history({ from: '2000-01-01', to: '2000-01-02' }, a)).total).toBe(0);
});
it('does not permit requests for any non-completed state or inactive accounts', async () => {
  const a = await user(100000n),
    b = await user();
  for (const status of [
    'CREATED',
    'PENDING_REVIEW',
    'PENDING_VERIFICATION',
    'PROCESSING',
    'FAILED',
    'REJECTED',
  ]) {
    const id = (
      await pool.query(
        'INSERT INTO transfers(sender_id,recipient_id,amount,reference,status) VALUES($1,$2,100,$3,$4) RETURNING id',
        [a, b, randomUUID(), status],
      )
    ).rows[0].id;
    await expect(submitRequest(a, id, randomUUID(), body, 'test')).rejects.toMatchObject({
      status: 409,
    });
  }
  const { a: sender, b: recipient, t } = await fixture();
  await pool.query("UPDATE users SET status='DISABLED' WHERE id=$1", [recipient]);
  await expect(submitRequest(sender, t.id, randomUUID(), body, 'test')).rejects.toMatchObject({
    code: 'REVERSAL_UNAVAILABLE',
  });
  await expect(
    reverse(admin, t.id, randomUUID(), 'Disabled recipient test', 'test'),
  ).rejects.toMatchObject({ code: 'REVERSAL_UNAVAILABLE' });
  expect(await balance(sender)).toBe('100000');
});
async function fund(id: string, amount: bigint) {
  const topup = await requestTopup(id, randomUUID(), amount, 'queue-test');
  await decideTopup(admin, topup.id, 'APPROVE', 'Fund the queued refund', 'queue-test');
}
it('requires a nonblank explanation and permits a request after the recipient spent the payment', async () => {
  const { a, b, t } = await fixture();
  for (const notes of [undefined, '', '   ', 'abcd'])
    await expect(
      submitRequest(a, t.id, randomUUID(), { reason: 'MISTAKE', notes }, 'test'),
    ).rejects.toBeDefined();
  await transfer(
    b,
    randomUUID(),
    { recipientId: await user(), amount: '1000', currency: 'INR', note: '' },
    'test',
  );
  expect((await submitRequest(a, t.id, randomUUID(), body, 'test')).status).toBe('PENDING');
});
it('reserves partial funds, settles automatically after funding, and never double-refunds under competing workers', async () => {
  const { a, b, t } = await fixture();
  await transfer(
    b,
    randomUUID(),
    { recipientId: await user(), amount: '800', currency: 'INR', note: '' },
    'test',
  );
  const r = await submitRequest(a, t.id, randomUUID(), body, 'test');
  expect(
    (await decideRequest(admin, r.id, 'APPROVE', 'Authorized refund when funds arrive', 'test'))
      .status,
  ).toBe('QUEUED');
  expect(
    (await decideRequest(admin, r.id, 'APPROVE', 'Safe retry of queue decision', 'test')).status,
  ).toBe('QUEUED');
  await expect(submitRequest(a, t.id, randomUUID(), body, 'test')).rejects.toMatchObject({
    code: 'REQUEST_EXISTS',
  });
  const wallet = (
    await pool.query('SELECT * FROM wallet_spendable_balances WHERE owner_id=$1', [b])
  ).rows[0];
  expect(wallet).toMatchObject({
    balance: '20000',
    available_balance: '0',
    reserved_balance: '20000',
    reversal_obligation: '100000',
  });
  const spend = await transfer(
    b,
    randomUUID(),
    { recipientId: await user(), amount: '1', currency: 'INR', note: '' },
    'test',
  );
  expect(spend.status).toBe('FAILED');
  expect(spend.failure_reason).toMatch(/reserved/);
  await fund(b, 30000n);
  await processQueuedReversals();
  expect(
    (await pool.query('SELECT status FROM reversal_requests WHERE id=$1', [r.id])).rows[0].status,
  ).toBe('QUEUED');
  expect((await history({ type: 'REVERSAL' }, a)).total).toBe(0);
  await fund(b, 50000n);
  await Promise.all(Array.from({ length: 6 }, () => processQueuedReversals()));
  const saved = (await pool.query('SELECT * FROM reversal_requests WHERE id=$1', [r.id])).rows[0];
  expect(saved.status).toBe('APPROVED');
  expect(saved.reversal_id).toBeTruthy();
  expect(await balance(a)).toBe('200000');
  expect(await balance(b)).toBe('0');
  expect((await pool.query('SELECT id FROM reversals WHERE transfer_id=$1', [t.id])).rowCount).toBe(
    1,
  );
  expect(
    (
      await pool.query(
        "SELECT id FROM audit_events WHERE entity_id=$1 AND action='REVERSAL_QUEUE_SETTLED'",
        [r.id],
      )
    ).rowCount,
  ).toBe(1);
  expect((await reconcile(admin, 'queued-reversal')).passed).toBe(true);
});
it('processes older approvals first for the same debtor and waits for frozen wallets to reactivate', async () => {
  const a = await user(100000n),
    b = await user(),
    c = await user(100000n),
    sink = await user();
  const first = await transfer(
    a,
    randomUUID(),
    { recipientId: b, amount: '1000', currency: 'INR', note: '' },
    'test',
  );
  const second = await transfer(
    c,
    randomUUID(),
    { recipientId: b, amount: '1000', currency: 'INR', note: '' },
    'test',
  );
  await transfer(
    b,
    randomUUID(),
    { recipientId: sink, amount: '2000', currency: 'INR', note: '' },
    'test',
  );
  const r1 = await submitRequest(a, first.id, randomUUID(), body, 'test'),
    r2 = await submitRequest(c, second.id, randomUUID(), body, 'test');
  await decideRequest(admin, r1.id, 'APPROVE', 'First authorized refund', 'test');
  await decideRequest(admin, r2.id, 'APPROVE', 'Second authorized refund', 'test');
  await fund(b, 150000n);
  await processQueuedReversals();
  expect(
    (await pool.query('SELECT status FROM reversal_requests WHERE id=$1', [r1.id])).rows[0].status,
  ).toBe('APPROVED');
  expect(
    (await pool.query('SELECT status FROM reversal_requests WHERE id=$1', [r2.id])).rows[0].status,
  ).toBe('QUEUED');
  await fund(b, 50000n);
  await pool.query("UPDATE wallets SET status='FROZEN' WHERE owner_id=$1", [b]);
  await processQueuedReversals();
  expect(
    (await pool.query('SELECT status FROM reversal_requests WHERE id=$1', [r2.id])).rows[0].status,
  ).toBe('QUEUED');
  await pool.query("UPDATE wallets SET status='ACTIVE' WHERE owner_id=$1", [b]);
  await processQueuedReversals();
  expect(
    (await pool.query('SELECT status FROM reversal_requests WHERE id=$1', [r2.id])).rows[0].status,
  ).toBe('APPROVED');
  expect(await balance(a)).toBe('100000');
  expect(await balance(c)).toBe('100000');
  expect(await balance(b)).toBe('0');
});
