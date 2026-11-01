import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { pool, transaction } from '../../db/pool.js';
import { ApiError } from '../../middleware/errors.js';
import { audit, lockWallets } from '../ledger/service.js';
import { complete, type Transfer } from '../transfers/service.js';
import { requireMail, sendCode } from './mail.js';
import { expireVerification, verificationExpiredMessage } from './expiry.js';
const hash = (id: string, challenge: string, code: string) =>
  createHmac('sha256', env.JWT_SECRET)
    .update(`payment-otp:${id}:${challenge}:${code}`)
    .digest('hex');
export async function issueCode(actor: string, id: string, requestId: string) {
  requireMail();
  const code = String(randomInt(0, 1000000)).padStart(6, '0'),
    challenge = randomUUID();
  const delivery = await transaction(async (c) => {
    const t = (
      await c.query<Transfer>('SELECT * FROM transfers WHERE id=$1 AND sender_id=$2 FOR UPDATE', [
        id,
        actor,
      ])
    ).rows[0];
    if (!t) throw new ApiError(404, 'NOT_FOUND', 'Payment not found.');
    if (await expireVerification(c, id, requestId)) return { error: verificationExpiredMessage };
    if (t.status !== 'PENDING_VERIFICATION')
      throw new ApiError(
        409,
        'NOT_AWAITING_VERIFICATION',
        'This payment is not awaiting verification.',
      );
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`otp-sender:${actor}`]);
    const email = (await c.query('SELECT email FROM users WHERE id=$1', [actor])).rows[0]
      .email as string;
    if (email.endsWith('.local'))
      throw new ApiError(
        422,
        'REAL_EMAIL_REQUIRED',
        'This demo address cannot receive email. Register with a real email address to use payment verification.',
      );
    const old = (
      await c.query(
        "SELECT *,last_sent_at>now()-interval '60 seconds' AS cooling FROM transfer_verifications WHERE transfer_id=$1",
        [id],
      )
    ).rows[0];
    if (old?.cooling)
      throw new ApiError(429, 'OTP_COOLDOWN', 'Wait 60 seconds before requesting another code.');
    if (old?.sends >= 5)
      throw new ApiError(429, 'OTP_SEND_LIMIT', 'This payment has reached its five-code limit.');
    const sends = (
      await c.query(
        "SELECT COALESCE(sum(v.sends),0)::int AS n FROM transfer_verifications v JOIN transfers t ON t.id=v.transfer_id WHERE t.sender_id=$1 AND v.last_sent_at>now()-interval '1 hour'",
        [actor],
      )
    ).rows[0].n;
    if (sends >= 20)
      throw new ApiError(
        429,
        'OTP_SEND_LIMIT',
        'Hourly email limit reached. Please try again later.',
      );
    await c.query(
      `INSERT INTO transfer_verifications(transfer_id,challenge_id,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes')
    ON CONFLICT(transfer_id) DO UPDATE SET challenge_id=$2,code_hash=$3,expires_at=now()+interval '5 minutes',attempts=0,sends=transfer_verifications.sends+1,last_sent_at=now(),delivery_status='SENDING'`,
      [id, challenge, hash(id, challenge, code)],
    );
    await audit(c, actor, 'PAYMENT_CODE_REQUESTED', id, requestId);
    return {
      email,
      reference: t.reference,
      amount: `${BigInt(t.amount) / 100n}.${(BigInt(t.amount) % 100n).toString().padStart(2, '0')}`,
    };
  });
  if ('error' in delivery) throw new ApiError(422, 'PAYMENT_VERIFICATION_EXPIRED', delivery.error!);
  // Never hold a database transaction open during a provider call.
  try {
    await sendCode(delivery.email, code, delivery.reference, delivery.amount);
  } catch (error) {
    await pool.query(
      "UPDATE transfer_verifications SET delivery_status='FAILED' WHERE transfer_id=$1 AND challenge_id=$2",
      [id, challenge],
    );
    throw error;
  }
  await pool.query(
    "UPDATE transfer_verifications SET delivery_status='SENT' WHERE transfer_id=$1 AND challenge_id=$2",
    [id, challenge],
  );
  return {
    message: 'Verification code sent. Check your inbox and spam folder.',
    expiresIn: 300,
    retryAfter: 60,
  };
}
export async function verifyCode(actor: string, id: string, raw: unknown, requestId: string) {
  const { code } = z
    .object({ code: z.string().regex(/^\d{6}$/) })
    .strict()
    .parse(raw);
  const result = await transaction(async (c) => {
    const t = (
      await c.query<Transfer>('SELECT * FROM transfers WHERE id=$1 AND sender_id=$2 FOR UPDATE', [
        id,
        actor,
      ])
    ).rows[0];
    if (!t) throw new ApiError(404, 'NOT_FOUND', 'Payment not found.');
    if (await expireVerification(c, id, requestId)) return { error: verificationExpiredMessage };
    const v = (
      await c.query(
        'SELECT *,expires_at<=now() AS expired FROM transfer_verifications WHERE transfer_id=$1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!v) return { error: 'Request a verification code first.' };
    const matches = timingSafeEqual(
      Buffer.from(v.code_hash, 'hex'),
      Buffer.from(hash(id, v.challenge_id, code), 'hex'),
    );
    if (v.consumed_at) {
      if (matches) return { transfer: t };
      return { error: 'This verification code has already been used.' };
    }
    if (t.status !== 'PENDING_VERIFICATION')
      return { error: 'This payment is no longer awaiting verification.' };
    if (v.expired || v.attempts >= 5)
      return { error: 'The code expired or reached its attempt limit. Request a new code.' };
    if (!matches) {
      await c.query('UPDATE transfer_verifications SET attempts=attempts+1 WHERE transfer_id=$1', [
        id,
      ]);
      await audit(c, actor, 'PAYMENT_CODE_REJECTED', id, requestId);
      return { error: 'Incorrect code. Please check your email and try again.' };
    }
    const wallets = await lockWallets(c, [t.sender_id, t.recipient_id]);
    // Check recent suspicious activity again. OTP never overrides other risk holds.
    const h = (
      await c.query(
        `SELECT count(*) FILTER(WHERE created_at>now()-interval '10 minutes')::int AS n,
   count(*) FILTER(WHERE status='FAILED' AND created_at>now()-interval '10 minutes')::int AS failures,
   COALESCE(sum(amount) FILTER(WHERE status IN ('COMPLETED','PENDING_REVIEW','PENDING_VERIFICATION')),0)::text AS amount
   FROM transfers WHERE sender_id=$1 AND id<>$2 AND created_at>now()-interval '1 hour'`,
        [actor, id],
      )
    ).rows[0];
    const age = (
      await c.query("SELECT created_at>now()-interval '24 hours' AS fresh FROM users WHERE id=$1", [
        actor,
      ])
    ).rows[0].fresh;
    const score =
      (h.n >= 5 ? 45 : 0) +
      (h.failures >= 3 ? 30 : 0) +
      (BigInt(h.amount) + BigInt(t.amount) >= 2000000n ? 35 : 0) +
      (age && BigInt(t.amount) >= 500000n ? 20 : 0);
    await c.query('UPDATE transfer_verifications SET consumed_at=now() WHERE transfer_id=$1', [id]);
    if (score >= 60)
      await c.query("UPDATE transfers SET status='PENDING_REVIEW',updated_at=now() WHERE id=$1", [
        id,
      ]);
    else await complete(c, t, wallets, actor, requestId);
    await audit(c, actor, 'PAYMENT_CODE_VERIFIED', id, requestId, {
      additionalReview: score >= 60,
    });
    return {
      transfer: (await c.query<Transfer>('SELECT * FROM transfers WHERE id=$1', [id])).rows[0]!,
    };
  });
  // Throw outside the transaction so failed-attempt counters persist.
  if (result.error) throw new ApiError(422, 'OTP_INVALID', result.error);
  return result.transfer;
}
