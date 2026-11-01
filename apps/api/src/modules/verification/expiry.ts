import type { PoolClient } from 'pg';
import { transaction } from '../../db/pool.js';
import { audit } from '../ledger/service.js';

export const verificationExpiredMessage =
  'Payment verification expired after 15 minutes. No money was moved. Start a new payment.';

// Call while holding the transfer lock. Use the database clock after acquiring the
// lock, so a confirmation that waited behind another transaction cannot revive it.
export async function expireVerification(c: PoolClient, id: string, requestId: string) {
  const result = await c.query(
    `UPDATE transfers SET status='FAILED',failure_reason=$2,updated_at=clock_timestamp()
     WHERE id=$1 AND status='PENDING_VERIFICATION'
       AND created_at<=clock_timestamp()-interval '15 minutes' RETURNING id`,
    [id, verificationExpiredMessage],
  );
  if (!result.rowCount) return false;
  await audit(c, null, 'PAYMENT_VERIFICATION_EXPIRED', id, requestId, { fundsMoved: false });
  return true;
}

export async function expirePendingVerifications(limit = 100) {
  return transaction(async (c) => {
    const candidates = await c.query(
      `SELECT id FROM transfers WHERE status='PENDING_VERIFICATION'
       AND created_at<=clock_timestamp()-interval '15 minutes'
       ORDER BY created_at,id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    let expired = 0;
    for (const row of candidates.rows)
      if (await expireVerification(c, row.id, 'verification-expiry-worker')) expired++;
    return expired;
  });
}
