import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { provision } from '../src/modules/ledger/service.js';
import { transfer } from '../src/modules/transfers/service.js';
import { issueCode, verifyCode } from '../src/modules/verification/service.js';
import { sendCode, requireMail } from '../src/modules/verification/mail.js';
vi.mock('../src/modules/verification/mail.js', () => ({ requireMail: vi.fn(), sendCode: vi.fn() }));
async function user(amount: bigint, email = `${randomUUID()}@example.com`) {
  return transaction(async (c) => {
    const u = (
      await c.query(
        "INSERT INTO users(name,email,password_hash,created_at) VALUES('OTP Test',$1,'test-only',now()-interval '2 days') RETURNING id",
        [email],
      )
    ).rows[0];
    await provision(c, u.id, amount);
    return u.id as string;
  });
}
async function fixture() {
  const a = await user(2000000n),
    b = await user(0n);
  const t = await transfer(
    a,
    randomUUID(),
    { recipientId: b, amount: '10000', currency: 'INR', note: 'OTP test' },
    'test',
  );
  return { a, b, t };
}
async function balance(id: string) {
  return (await pool.query('SELECT balance FROM wallet_balances WHERE owner_id=$1', [id])).rows[0]
    .balance;
}
async function code(a: string, id: string) {
  await issueCode(a, id, 'test');
  return vi.mocked(sendCode).mock.calls.at(-1)![1];
}
beforeAll(migrate);
beforeEach(() => vi.clearAllMocks());
afterAll(() => pool.end());
it('requires email for an older account and commits exactly one payment under concurrent OTP retries', async () => {
  const { a, b, t } = await fixture();
  expect(t.status).toBe('PENDING_VERIFICATION');
  expect(await balance(b)).toBe('0');
  const otp = await code(a, t.id);
  expect(otp).toMatch(/^\d{6}$/);
  const stored = (
    await pool.query('SELECT code_hash FROM transfer_verifications WHERE transfer_id=$1', [t.id])
  ).rows[0];
  expect(stored.code_hash).not.toContain(otp);
  const results = await Promise.all(
    Array.from({ length: 10 }, () => verifyCode(a, t.id, { code: otp }, 'test')),
  );
  expect(results.every((r) => r?.status === 'COMPLETED')).toBe(true);
  expect(await balance(a)).toBe('1000000');
  expect(await balance(b)).toBe('1000000');
  expect(
    (await pool.query('SELECT id FROM ledger_journals WHERE reference=$1', [t.reference])).rowCount,
  ).toBe(1);
});
it('wrong codes persist attempt limits; expired and superseded codes cannot post money', async () => {
  const { a, b, t } = await fixture();
  const otp = await code(a, t.id),
    wrong = otp === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++)
    await expect(verifyCode(a, t.id, { code: wrong }, 'test')).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  await expect(verifyCode(a, t.id, { code: otp }, 'test')).rejects.toMatchObject({
    code: 'OTP_INVALID',
  });
  expect(
    (await pool.query('SELECT attempts FROM transfer_verifications WHERE transfer_id=$1', [t.id]))
      .rows[0].attempts,
  ).toBe(5);
  await expect(issueCode(a, t.id, 'test')).rejects.toMatchObject({ code: 'OTP_COOLDOWN' });
  await pool.query(
    "UPDATE transfer_verifications SET last_sent_at=now()-interval '61 seconds' WHERE transfer_id=$1",
    [t.id],
  );
  const next = await code(a, t.id);
  if (next !== otp)
    await expect(verifyCode(a, t.id, { code: otp }, 'test')).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  await pool.query(
    "UPDATE transfer_verifications SET expires_at=now()-interval '1 second' WHERE transfer_id=$1",
    [t.id],
  );
  await expect(verifyCode(a, t.id, { code: next }, 'test')).rejects.toMatchObject({
    code: 'OTP_INVALID',
  });
  expect(await balance(b)).toBe('0');
});
it('binds codes to sender and exact payment, checks current balance, and never leaks codes in API responses', async () => {
  const { a, b, t } = await fixture();
  const otp = await code(a, t.id);
  await expect(verifyCode(b, t.id, { code: otp }, 'test')).rejects.toMatchObject({ status: 404 });
  await expect(issueCode(b, t.id, 'test')).rejects.toMatchObject({ status: 404 });
  const second = await transfer(
    a,
    randomUUID(),
    { recipientId: b, amount: '10000', currency: 'INR', note: 'Second intent' },
    'test',
  );
  await expect(verifyCode(a, second.id, { code: otp }, 'test')).rejects.toMatchObject({
    code: 'OTP_INVALID',
  });
  // Spend enough through ordinary sub-threshold payments to invalidate the held payment's balance.
  await transfer(
    a,
    randomUUID(),
    { recipientId: b, amount: '9000', currency: 'INR', note: '' },
    'test',
  );
  await transfer(
    a,
    randomUUID(),
    { recipientId: b, amount: '2000', currency: 'INR', note: '' },
    'test',
  );
  const result = await verifyCode(a, t.id, { code: otp }, 'test');
  expect(result?.status).toBe('FAILED');
  expect(result?.journal_id).toBeNull();
  expect(await balance(a)).toBe('900000');
});
it('keeps additional suspicious activity in review rather than bypassing it with OTP', async () => {
  const { a, b, t } = await fixture();
  const otp = await code(a, t.id);
  for (let i = 0; i < 5; i++)
    await pool.query(
      "INSERT INTO transfers(sender_id,recipient_id,amount,reference,status) VALUES($1,$2,1,$3,'FAILED')",
      [a, b, randomUUID()],
    );
  const result = await verifyCode(a, t.id, { code: otp }, 'test');
  expect(result?.status).toBe('PENDING_REVIEW');
  expect(await balance(b)).toBe('0');
});
it('handles missing configuration, fake addresses and provider failures without posting', async () => {
  const { a, b, t } = await fixture();
  vi.mocked(requireMail).mockImplementationOnce(() => {
    throw new Error('Email not configured');
  });
  await expect(issueCode(a, t.id, 'test')).rejects.toThrow('Email not configured');
  vi.mocked(sendCode).mockRejectedValueOnce(new Error('Provider unavailable'));
  await expect(issueCode(a, t.id, 'test')).rejects.toThrow('Provider unavailable');
  expect(
    (
      await pool.query('SELECT delivery_status FROM transfer_verifications WHERE transfer_id=$1', [
        t.id,
      ])
    ).rows[0].delivery_status,
  ).toBe('FAILED');
  expect(await balance(b)).toBe('0');
  const demo = await user(2000000n, `${randomUUID()}@settlecraft.local`),
    dt = await transfer(
      demo,
      randomUUID(),
      { recipientId: b, amount: '10000', currency: 'INR', note: '' },
      'test',
    );
  await expect(issueCode(demo, dt.id, 'test')).rejects.toMatchObject({
    code: 'REAL_EMAIL_REQUIRED',
  });
});

async function expiredFixture() {
  const a = await user(2000000n),
    b = await user(0n);
  const t = (
    await pool.query(
      `INSERT INTO transfers(sender_id,recipient_id,amount,reference,status,created_at)
     VALUES($1,$2,1000000,$3,'PENDING_VERIFICATION',now()-interval '16 minutes') RETURNING *`,
      [a, b, randomUUID()],
    )
  ).rows[0];
  return { a, b, t };
}
it('expires abandoned payments with no OTP and concurrent sweeps produce one audit event and no journal', async () => {
  const { expirePendingVerifications } = await import('../src/modules/verification/expiry.js');
  const { a, b, t } = await expiredFixture();
  await Promise.all([expirePendingVerifications(), expirePendingVerifications()]);
  const stored = (await pool.query('SELECT * FROM transfers WHERE id=$1', [t.id])).rows[0];
  expect(stored.status).toBe('FAILED');
  expect(stored.failure_reason).toContain('15 minutes');
  expect(stored.journal_id).toBeNull();
  expect(await balance(a)).toBe('2000000');
  expect(await balance(b)).toBe('0');
  expect(
    (
      await pool.query(
        "SELECT id FROM audit_events WHERE entity_id=$1 AND action='PAYMENT_VERIFICATION_EXPIRED'",
        [t.id],
      )
    ).rowCount,
  ).toBe(1);
});
it('expires synchronously on resend even when the worker is offline, without sending mail', async () => {
  const { a, t } = await expiredFixture();
  await expect(issueCode(a, t.id, 'test')).rejects.toMatchObject({
    code: 'PAYMENT_VERIFICATION_EXPIRED',
  });
  expect(sendCode).not.toHaveBeenCalled();
  expect(
    (await pool.query('SELECT status FROM transfers WHERE id=$1', [t.id])).rows[0].status,
  ).toBe('FAILED');
});
it('a fresh valid OTP cannot revive an expired payment, including a race with the worker', async () => {
  const { createHmac } = await import('node:crypto');
  const { env } = await import('../src/config/env.js');
  const { expirePendingVerifications } = await import('../src/modules/verification/expiry.js');
  const { a, b, t } = await expiredFixture();
  const challenge = randomUUID(),
    otp = '123456';
  const hash = createHmac('sha256', env.JWT_SECRET)
    .update(`payment-otp:${t.id}:${challenge}:${otp}`)
    .digest('hex');
  await pool.query(
    `INSERT INTO transfer_verifications(transfer_id,challenge_id,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes')`,
    [t.id, challenge, hash],
  );
  const [confirmation] = await Promise.allSettled([
    verifyCode(a, t.id, { code: otp }, 'test'),
    expirePendingVerifications(),
  ]);
  expect(confirmation.status).toBe('rejected');
  expect(
    (await pool.query('SELECT status,journal_id FROM transfers WHERE id=$1', [t.id])).rows[0],
  ).toMatchObject({ status: 'FAILED', journal_id: null });
  expect(await balance(b)).toBe('0');
});
it('expiry sweeps leave fresh verification payments and completed payments unchanged', async () => {
  const { expirePendingVerifications } = await import('../src/modules/verification/expiry.js');
  const first = await fixture(),
    second = await fixture();
  const otp = await code(second.a, second.t.id);
  await verifyCode(second.a, second.t.id, { code: otp }, 'test');
  await expirePendingVerifications();
  expect(
    (await pool.query('SELECT status FROM transfers WHERE id=$1', [first.t.id])).rows[0].status,
  ).toBe('PENDING_VERIFICATION');
  expect(
    (await pool.query('SELECT status FROM transfers WHERE id=$1', [second.t.id])).rows[0].status,
  ).toBe('COMPLETED');
});
