import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../../db/pool.js';
import { audit } from '../ledger/service.js';
import { reverseInTransaction } from '../transfers/service.js';
import { ApiError } from '../../middleware/errors.js';
// Each refund is one transaction. Multiple workers may race safely; transfer locks and
// the unique reversal constraint remain the final authority. Oldest approval first per debtor.
export async function processQueuedReversals(limit = 10) {
  const candidates = (
    await pool.query(
      `SELECT q.id,q.original_transfer_id FROM reversal_requests q
 JOIN transfers t ON t.id=q.original_transfer_id JOIN wallet_balances b ON b.owner_id=t.recipient_id
 JOIN wallets sw ON sw.owner_id=t.sender_id JOIN users su ON su.id=t.sender_id JOIN users du ON du.id=t.recipient_id
 WHERE q.status='QUEUED' AND b.balance::numeric>=t.amount AND b.status='ACTIVE' AND sw.status='ACTIVE' AND su.status='ACTIVE' AND du.status='ACTIVE'
 AND NOT EXISTS(SELECT 1 FROM reversal_requests prior JOIN transfers pt ON pt.id=prior.original_transfer_id
 WHERE prior.status='QUEUED' AND pt.recipient_id=t.recipient_id AND (prior.queued_at,prior.id)<(q.queued_at,q.id))
 ORDER BY q.queued_at,q.id LIMIT $1`,
      [limit],
    )
  ).rows;
  let settled = 0;
  for (const candidate of candidates) {
    try {
      const completed = await transaction(async (c) => {
        if (
          !(
            await c.query('SELECT id FROM transfers WHERE id=$1 FOR UPDATE SKIP LOCKED', [
              candidate.original_transfer_id,
            ])
          ).rowCount
        )
          return false;
        const q = (
          await c.query(
            "SELECT * FROM reversal_requests WHERE id=$1 AND status='QUEUED' FOR UPDATE",
            [candidate.id],
          )
        ).rows[0];
        if (!q) return false;
        const requestId = `queued-reversal-${randomUUID()}`;
        const reversal = await reverseInTransaction(
          c,
          q.reviewed_by,
          q.original_transfer_id,
          q.decision_reason,
          requestId,
        );
        await audit(c, q.reviewed_by, 'REVERSAL_QUEUE_SETTLED', q.id, requestId, {
          reversalId: reversal.id,
          authorizedAt: q.reviewed_at,
        });
        return true;
      });
      if (completed) settled++;
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        !['REVERSAL_FUNDS_PENDING', 'REVERSAL_UNAVAILABLE'].includes(error.code)
      )
        throw error;
      // Funds/account status changed after candidate selection. Keep the durable queue item.
    }
  }
  return settled;
}
