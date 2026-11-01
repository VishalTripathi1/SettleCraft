import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool, transaction } from '../../db/pool.js';
import { ApiError } from '../../middleware/errors.js';
import { audit, lockWallets } from '../ledger/service.js';
import { idempotent, reverseInTransaction } from '../transfers/service.js';
export const requestSchema = z
  .object({
    reason: z.enum([
      'WRONG_RECIPIENT',
      'INCORRECT_AMOUNT',
      'DUPLICATE_PAYMENT',
      'MISTAKE',
      'OTHER',
    ]),
    notes: z.string().trim().min(5).max(1000),
  })
  .strict();
export async function eligibility(
  id: string,
  db: Pick<PoolClient, 'query'> = pool,
  requireFunds = true,
) {
  const r = await db.query(
    `SELECT t.status='COMPLETED' AND r.id IS NULL AND
    s.status='ACTIVE' AND d.status='ACTIVE' AND su.status='ACTIVE' AND du.status='ACTIVE' AND (NOT $2::boolean OR d.balance::bigint>=t.amount) AS eligible
    FROM transfers t JOIN wallet_balances s ON s.owner_id=t.sender_id JOIN wallet_balances d ON d.owner_id=t.recipient_id
    JOIN users su ON su.id=t.sender_id JOIN users du ON du.id=t.recipient_id
    LEFT JOIN reversals r ON r.transfer_id=t.id WHERE t.id=$1`,
    [id, requireFunds],
  );
  return r.rows[0]?.eligible ?? false;
}
export async function submitRequest(
  actor: string,
  transferId: string,
  key: string,
  raw: unknown,
  requestId: string,
) {
  const data = requestSchema.parse(raw);
  return transaction((c) =>
    idempotent(c, actor, 'reversal-request', key, { transferId, ...data }, async () => {
      const t = (
        await c.query('SELECT * FROM transfers WHERE id=$1 AND sender_id=$2 FOR UPDATE', [
          transferId,
          actor,
        ])
      ).rows[0];
      if (!t) throw new ApiError(404, 'NOT_FOUND', 'Outgoing payment not found.');
      if (
        t.status !== 'COMPLETED' ||
        (await c.query('SELECT id FROM reversals WHERE transfer_id=$1', [transferId])).rowCount
      )
        throw new ApiError(
          409,
          'NOT_REVERSIBLE',
          'Only completed, unreversed payments are eligible.',
        );
      if (
        (
          await c.query(
            "SELECT id FROM reversal_requests WHERE original_transfer_id=$1 AND status IN ('PENDING','QUEUED')",
            [transferId],
          )
        ).rowCount
      )
        throw new ApiError(409, 'REQUEST_EXISTS', 'A reversal request is already pending.');
      // No funds are reserved here. Eligibility is indicative and is rechecked under wallet locks on approval.
      if (!(await eligibility(transferId, c, false)))
        throw new ApiError(
          409,
          'REVERSAL_UNAVAILABLE',
          'Both accounts and wallets must be active.',
        );
      const r = (
        await c.query(
          `INSERT INTO reversal_requests(original_transfer_id,requester_id,reason,notes) VALUES($1,$2,$3,$4) RETURNING *`,
          [transferId, actor, data.reason, data.notes],
        )
      ).rows[0];
      await audit(c, actor, 'REVERSAL_REQUEST_SUBMITTED', r.id, requestId, { transferId });
      return r;
    }),
  );
}
export async function decideRequest(
  actor: string,
  id: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string,
  requestId: string,
) {
  return transaction(async (c) => {
    const found = (
      await c.query('SELECT original_transfer_id FROM reversal_requests WHERE id=$1', [id])
    ).rows[0];
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Reversal request not found.');
    await c.query('SELECT id FROM transfers WHERE id=$1 FOR UPDATE', [found.original_transfer_id]);
    const r = (await c.query('SELECT * FROM reversal_requests WHERE id=$1 FOR UPDATE', [id]))
      .rows[0];
    if (r.status !== 'PENDING') {
      if (
        (decision === 'APPROVE' && ['APPROVED', 'QUEUED', 'FAILED'].includes(r.status)) ||
        (decision === 'REJECT' && r.status === 'REJECTED')
      )
        return r;
      throw new ApiError(409, 'ALREADY_DECIDED', 'This request already has a different decision.');
    }
    if (decision === 'REJECT') {
      await c.query(
        "UPDATE reversal_requests SET status='REJECTED', reviewed_by=$2, reviewed_at=now(), updated_at=now(), decision_reason=$3 WHERE id=$1",
        [id, actor, rationale],
      );
      await audit(c, actor, 'REVERSAL_REQUEST_REJECTED', id, requestId, { rationale });
    } else {
      await c.query('SAVEPOINT financial_reversal');
      try {
        const reversal = await reverseInTransaction(
          c,
          actor,
          r.original_transfer_id,
          rationale,
          requestId,
        );
        await audit(c, actor, 'REVERSAL_REQUEST_APPROVED', id, requestId, {
          reversalId: reversal.id,
        });
      } catch (error) {
        if (
          !(error instanceof ApiError) ||
          ![
            'NOT_REVERSIBLE',
            'ALREADY_REVERSED',
            'REVERSAL_UNAVAILABLE',
            'REVERSAL_FUNDS_PENDING',
            'WALLET_NOT_FOUND',
          ].includes(error.code)
        )
          throw error;
        await c.query('ROLLBACK TO SAVEPOINT financial_reversal');
        if (error.code === 'REVERSAL_FUNDS_PENDING') {
          // Reacquire wallet locks released by the savepoint rollback before reserving future funds.
          const t = (
            await c.query('SELECT sender_id,recipient_id FROM transfers WHERE id=$1', [
              r.original_transfer_id,
            ])
          ).rows[0];
          await lockWallets(c, [t.sender_id, t.recipient_id]);
          await c.query(
            "UPDATE reversal_requests SET status='QUEUED',queued_at=clock_timestamp(),reviewed_by=$2,reviewed_at=now(),updated_at=now(),decision_reason=$3 WHERE id=$1",
            [id, actor, rationale],
          );
          await audit(c, actor, 'REVERSAL_REQUEST_QUEUED', id, requestId, {
            reason: 'Waiting for sufficient unreserved recipient funds.',
          });
        } else {
          await c.query(
            "UPDATE reversal_requests SET status='FAILED',reviewed_by=$2,reviewed_at=now(),updated_at=now(),decision_reason=$3,failure_reason=$4 WHERE id=$1",
            [id, actor, rationale, error.message],
          );
          await audit(c, actor, 'REVERSAL_REQUEST_FAILED', id, requestId, {
            reason: error.message,
          });
        }
      }
    }
    return (await c.query('SELECT * FROM reversal_requests WHERE id=$1', [id])).rows[0];
  });
}
