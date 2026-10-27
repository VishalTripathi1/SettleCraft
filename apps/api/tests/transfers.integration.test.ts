import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { pool, transaction } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { provision, post } from '../src/modules/ledger/service.js';
import { transfer, review, reverse } from '../src/modules/transfers/service.js';
import { requestTopup, decideTopup, reconcile } from '../src/modules/admin/service.js';
import { session } from '../src/modules/auth/service.js';
import { createApp } from '../src/app.js';
import type { User } from '@settlecraft/shared';
let admin: string;
async function user(amount: bigint, role = 'USER') {
  return transaction(async (c) => {
    const u = (
      await c.query<{ id: string }>(
        "INSERT INTO users(name,email,password_hash,role,created_at) VALUES('Test Person',$1,'test-only',$2,now()-interval '2 days') RETURNING id",
        [`${randomUUID()}@test.local`, role],
      )
    ).rows[0]!;
    await provision(c, u.id, amount);
    return u.id;
  });
}
async function balance(id: string) {
  return (
    await pool.query<{ balance: string }>('SELECT balance FROM wallet_balances WHERE owner_id=$1', [
      id,
    ])
  ).rows[0]!.balance;
}
const payload = (recipientId: string, amount = '500.00') => ({
  recipientId,
  amount,
  currency: 'INR',
  note: 'Integration test',
});
beforeAll(async () => {
  await migrate();
  admin = await user(0n, 'ADMIN');
});
afterAll(() => pool.end());
it('posts the Rahul/Priya example exactly once, including 20 concurrent retries and a lost-response retry', async () => {
  const a = await user(200000n),
    b = await user(100000n),
    key = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 20 }, () => transfer(a, key, payload(b), 'test')),
  );
  expect(new Set(results.map((r) => r.id)).size).toBe(1);
  expect(results[0]!.status).toBe('COMPLETED');
  expect(await balance(a)).toBe('150000');
  expect(await balance(b)).toBe('150000');
  const after = await transfer(a, key, payload(b), 'retry-after-commit');
  expect(after).toEqual(results[0]);
  await expect(transfer(a, key, payload(b, '600'), 'test')).rejects.toMatchObject({ status: 409 });
  expect(
    (await pool.query('SELECT * FROM ledger_journals WHERE id=$1', [after.journal_id])).rowCount,
  ).toBe(1);
});
it('serializes competing outgoing transfers without overdrawing', async () => {
  const a = await user(200000n),
    b = await user(0n);
  const result = await Promise.all(
    Array.from({ length: 12 }, () => transfer(a, randomUUID(), payload(b, '300'), 'concurrent')),
  );
  expect(result.filter((r) => r.status === 'COMPLETED')).toHaveLength(6);
  expect(await balance(a)).toBe('20000');
  expect(await balance(b)).toBe('180000');
  expect(result.filter((r) => r.status === 'FAILED')).toHaveLength(6);
});
it('invalid amounts, self-transfers, missing and frozen recipients post nothing', async () => {
  const a = await user(100000n),
    b = await user(0n);
  await pool.query("UPDATE wallets SET status='FROZEN' WHERE owner_id=$1", [b]);
  for (const amount of ['0', '-1', '1.001', '999999999999999999', '1;DROP'])
    await expect(transfer(a, randomUUID(), payload(b, amount), 'test')).rejects.toBeDefined();
  await expect(transfer(a, randomUUID(), payload(a), 'test')).rejects.toMatchObject({
    status: 422,
  });
  await expect(transfer(a, randomUUID(), payload(randomUUID()), 'test')).rejects.toMatchObject({
    status: 404,
  });
  const failed = await transfer(a, randomUUID(), payload(b), 'test');
  expect(failed.status).toBe('FAILED');
  expect(failed.journal_id).toBeNull();
  expect(await balance(a)).toBe('100000');
});
it('rolls back a complete tentative posting on simulated application failure', async () => {
  const before = (await pool.query('SELECT count(*)::int AS n FROM ledger_entries')).rows[0].n;
  await expect(
    transaction(async (c) => {
      const a = await user(0n),
        b = await user(0n);
      const accounts = await c.query(
        'SELECT a.id FROM ledger_accounts a JOIN wallets w ON w.id=a.wallet_id WHERE owner_id=ANY($1::uuid[])',
        [[a, b]],
      );
      await post(c, 'TRANSFER', randomUUID(), accounts.rows[0].id, accounts.rows[1].id, 100n);
      throw new Error('injected crash');
    }),
  ).rejects.toThrow('injected crash');
  expect((await pool.query('SELECT count(*)::int AS n FROM ledger_entries')).rows[0].n).toBe(
    before,
  );
});
it('holds high risk without posting, rejects safely, and serializes competing approvals', async () => {
  const a = await user(5000000n),
    b = await user(0n);
  const held = await transfer(a, randomUUID(), payload(b, '10000'), 'test');
  expect(held.status).toBe('PENDING_REVIEW');
  expect(await balance(b)).toBe('0');
  const decisions = await Promise.allSettled([
    review(admin, held.id, 'APPROVE', 'Reviewed synthetic test', 'test'),
    review(admin, held.id, 'APPROVE', 'Second review attempt', 'test'),
  ]);
  expect(decisions.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await balance(b)).toBe('1000000');
  const rejected = await transfer(a, randomUUID(), payload(b, '10000'), 'test');
  await review(admin, rejected.id, 'REJECT', 'Synthetic risk is excessive', 'test');
  expect(await balance(b)).toBe('1000000');
});
it('rechecks funds on approval; pending requests do not reserve funds', async () => {
  const a = await user(1000000n),
    b = await user(0n);
  const held = await transfer(a, randomUUID(), payload(b, '10000'), 'test');
  await transfer(a, randomUUID(), payload(b, '100'), 'test');
  const decided = await review(admin, held.id, 'APPROVE', 'Reviewed but funds changed', 'test');
  expect(decided.status).toBe('FAILED');
  expect(decided.journal_id).toBeNull();
});
it('reverses with a new journal and cannot reverse twice', async () => {
  const a = await user(200000n),
    b = await user(0n);
  const t = await transfer(a, randomUUID(), payload(b), 'test');
  const key = randomUUID();
  const r = await reverse(admin, t.id, key, 'Customer requested correction', 'test');
  expect(r.journalId).not.toBe(t.journal_id);
  expect(await balance(a)).toBe('200000');
  expect(await balance(b)).toBe('0');
  expect(await reverse(admin, t.id, key, 'Customer requested correction', 'retry')).toEqual(r);
  await expect(
    reverse(admin, t.id, randomUUID(), 'Duplicate refund attempt', 'test'),
  ).rejects.toMatchObject({ status: 409 });
});
it('requires admin topup approval, deduplicates funding, and enforces caps', async () => {
  const a = await user(0n),
    key = randomUUID();
  const t = await requestTopup(a, key, 100000n, 'test');
  expect(await balance(a)).toBe('0');
  expect((await requestTopup(a, key, 100000n, 'test')).id).toBe(t.id);
  await decideTopup(admin, t.id, 'APPROVE', 'Approved synthetic funds', 'test');
  expect(await balance(a)).toBe('100000');
  await expect(
    decideTopup(admin, t.id, 'APPROVE', 'Duplicate decision', 'test'),
  ).rejects.toMatchObject({ status: 409 });
  await expect(requestTopup(a, randomUUID(), 1000001n, 'test')).rejects.toMatchObject({
    status: 422,
  });
});
it('enforces API RBAC and resource ownership', async () => {
  const a = await user(100000n),
    b = await user(0n),
    other = await user(0n);
  const t = await transfer(a, randomUUID(), payload(b), 'test');
  const u = (await pool.query<User>('SELECT id,name,email,role FROM users WHERE id=$1', [other]))
    .rows[0]!;
  const token = (await transaction((c) => session(c, u))).accessToken;
  const app = createApp();
  expect(
    (await request(app).get('/api/v1/admin/overview').set('Authorization', `Bearer ${token}`))
      .status,
  ).toBe(403);
  expect(
    (await request(app).get(`/api/v1/transfers/${t.id}`).set('Authorization', `Bearer ${token}`))
      .status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .post('/api/v1/transfers')
        .set('Authorization', `Bearer ${token}`)
        .send(payload(b))
    ).status,
  ).toBe(422);
});
it('reconciles legitimate activity and detects deliberately introduced negative balances', async () => {
  expect((await reconcile(admin, 'test')).passed).toBe(true);
  const a = await user(0n),
    b = await user(0n);
  // An isolated test fixture calls the low-level journal writer without the transfer service's balance lock/check.
  const journal = await transaction(async (c) => {
    const ids = (
      await c.query(
        'SELECT a.id,w.owner_id FROM ledger_accounts a JOIN wallets w ON w.id=a.wallet_id WHERE w.owner_id=ANY($1::uuid[])',
        [[a, b]],
      )
    ).rows;
    return post(
      c,
      'TRANSFER',
      randomUUID(),
      ids.find((x) => x.owner_id === a).id,
      ids.find((x) => x.owner_id === b).id,
      1n,
    );
  });
  expect((await reconcile(admin, 'corruption-test')).passed).toBe(false);
  await transaction(async (c) => {
    const entries = (
      await c.query('SELECT account_id,direction FROM ledger_entries WHERE journal_id=$1', [
        journal,
      ])
    ).rows;
    await post(
      c,
      'REVERSAL',
      randomUUID(),
      entries.find((x) => x.direction === 'CREDIT').account_id,
      entries.find((x) => x.direction === 'DEBIT').account_id,
      1n,
    );
  });
  expect((await reconcile(admin, 'restored-test')).passed).toBe(true);
});
