import { randomUUID, createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { parseAmount, transferSchema } from '@settlecraft/shared';
import { z } from 'zod';
import { transaction } from '../../db/pool.js';
import { ApiError } from '../../middleware/errors.js';
import { post, lockWallets, audit, type Wallet } from '../ledger/service.js';
import { assess } from '../risk/service.js';
export type Transfer = {
  id: string;
  sender_id: string;
  recipient_id: string;
  amount: string;
  status: string;
  journal_id: string | null;
  reference: string;
  failure_reason: string | null;
};
export async function idempotent<T>(
  c: PoolClient,
  actor: string,
  scope: string,
  key: string,
  payload: unknown,
  run: () => Promise<T>,
): Promise<T> {
  z.string()
    .min(8)
    .max(128)
    .regex(/^[\w-]+$/)
    .parse(key);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
    `${actor}:${scope}:${key}`,
  ]);
  const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const old = await c.query<{ fingerprint: string; response: T }>(
    'SELECT fingerprint,response FROM idempotency_records WHERE actor_id=$1 AND scope=$2 AND key=$3',
    [actor, scope, key],
  );
  if (old.rows[0]) {
    if (old.rows[0].fingerprint !== fingerprint)
      throw new ApiError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'This request key was already used with different details.',
      );
    return old.rows[0].response;
  }
  const result = JSON.parse(JSON.stringify(await run())) as T;
  await c.query(
    'INSERT INTO idempotency_records(actor_id,scope,key,fingerprint,response) VALUES($1,$2,$3,$4,$5)',
    [actor, scope, key, fingerprint, JSON.stringify(result)],
  );
  return result;
}
export async function event(c: PoolClient, type: string, id: string) {
  await c.query('INSERT INTO outbox_events(type,entity_id,payload) VALUES($1,$2,$3)', [
    type,
    id,
    JSON.stringify({ id, type }),
  ]);
}
export async function complete(
  c: PoolClient,
  t: Transfer,
  wallets: Wallet[],
  actor: string,
  requestId: string,
) {
  const sender = wallets.find((w) => w.owner_id === t.sender_id)!;
  const recipient = wallets.find((w) => w.owner_id === t.recipient_id)!;
  const active =
    (
      await c.query("SELECT id FROM users WHERE id=ANY($1::uuid[]) AND status='ACTIVE'", [
        [t.sender_id, t.recipient_id],
      ])
    ).rowCount === 2;
  const failure = !active
    ? 'An account is unavailable.'
    : sender.status !== 'ACTIVE' || recipient.status !== 'ACTIVE'
      ? 'A wallet is frozen.'
      : BigInt(sender.balance) < BigInt(t.amount)
        ? 'Insufficient available funds.'
        : BigInt(sender.balance) - BigInt(sender.reserved) < BigInt(t.amount)
          ? 'Funds are reserved for an approved reversal waiting to settle.'
          : null;
  if (failure) {
    await c.query(
      "UPDATE transfers SET status='FAILED',failure_reason=$2,updated_at=now() WHERE id=$1",
      [t.id, failure],
    );
    await audit(c, actor, 'TRANSFER_FAILED', t.id, requestId, { reason: failure });
    return;
  }
  await c.query("UPDATE transfers SET status='PROCESSING',updated_at=now() WHERE id=$1", [t.id]);
  const journal = await post(
    c,
    'TRANSFER',
    t.reference,
    sender.account_id,
    recipient.account_id,
    BigInt(t.amount),
  );
  await c.query(
    "UPDATE transfers SET status='COMPLETED',journal_id=$2,updated_at=now() WHERE id=$1",
    [t.id, journal],
  );
  await audit(c, actor, 'TRANSFER_COMPLETED', t.id, requestId);
  await event(c, 'transfer.completed', t.id);
}
export async function transfer(actor: string, key: string, raw: unknown, requestId: string) {
  const data = transferSchema.parse(raw);
  if (data.recipientId === actor)
    throw new ApiError(422, 'SELF_TRANSFER', 'Choose another recipient.');
  const amount = parseAmount(data.amount);
  return transaction((c) =>
    idempotent(c, actor, 'transfer', key, { ...data, amount: amount.toString() }, async () => {
      const wallets = await lockWallets(c, [actor, data.recipientId]);
      const recipient = await c.query("SELECT id FROM users WHERE id=$1 AND status='ACTIVE'", [
        data.recipientId,
      ]);
      if (!recipient.rowCount)
        throw new ApiError(404, 'RECIPIENT_NOT_FOUND', 'Recipient is unavailable.');
      const history = await c.query<{
        recent_count: string;
        recent_amount: string;
        failures: string;
      }>(
        "SELECT count(*) FILTER(WHERE created_at>now()-interval '10 minutes')::text AS recent_count,COALESCE(sum(amount) FILTER(WHERE status IN ('COMPLETED','PENDING_REVIEW','PENDING_VERIFICATION')),0)::text AS recent_amount,count(*) FILTER(WHERE status='FAILED' AND created_at>now()-interval '10 minutes')::text AS failures FROM transfers WHERE sender_id=$1 AND created_at>now()-interval '1 hour'",
        [actor],
      );
      const age = await c.query<{ is_new: boolean }>(
        "SELECT created_at>now()-interval '24 hours' AS is_new FROM users WHERE id=$1",
        [actor],
      );
      const h = history.rows[0]!;
      const risk = assess({
        amount,
        recentCount: Number(h.recent_count),
        recentAmount: BigInt(h.recent_amount),
        newAccount: age.rows[0]!.is_new,
        failures: Number(h.failures),
      });
      const id = randomUUID();
      const reference = `SC-${id.slice(0, 8).toUpperCase()}`;
      const t = (
        await c.query<Transfer>(
          "INSERT INTO transfers(id,sender_id,recipient_id,amount,note,reference,status) VALUES($1,$2,$3,$4,$5,$6,'CREATED') RETURNING *",
          [id, actor, data.recipientId, amount.toString(), data.note, reference],
        )
      ).rows[0]!;
      await c.query(
        'INSERT INTO risk_assessments(transfer_id,score,level,action,rule_version,signals) VALUES($1,$2,$3,$4,$5,$6)',
        [id, risk.score, risk.level, risk.action, risk.ruleVersion, JSON.stringify(risk.signals)],
      );
      if (
        (risk.action === 'REVIEW' || amount >= 1000000n) &&
        wallets.every((w) => w.status === 'ACTIVE') &&
        BigInt(wallets.find((w) => w.owner_id === actor)!.balance) -
          BigInt(wallets.find((w) => w.owner_id === actor)!.reserved) >=
          amount
      ) {
        const otherRisk = risk.signals
          .filter((s) => s.id !== 'large_amount')
          .reduce((sum, s) => sum + s.points, 0);
        const status =
          amount >= 1000000n && otherRisk < 60 ? 'PENDING_VERIFICATION' : 'PENDING_REVIEW';
        await c.query('UPDATE transfers SET status=$2,updated_at=now() WHERE id=$1', [id, status]);
        await audit(c, actor, 'TRANSFER_HELD', id, requestId);
      } else await complete(c, t, wallets, actor, requestId);
      return (await c.query<Transfer>('SELECT * FROM transfers WHERE id=$1', [id])).rows[0]!;
    }),
  );
}
export async function review(
  actor: string,
  id: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string,
  requestId: string,
) {
  return transaction(async (c) => {
    const r = await c.query<Transfer>('SELECT * FROM transfers WHERE id=$1 FOR UPDATE', [id]);
    const t = r.rows[0];
    if (!t) throw new ApiError(404, 'NOT_FOUND', 'Transfer not found.');
    if (t.status !== 'PENDING_REVIEW')
      throw new ApiError(409, 'ALREADY_DECIDED', 'This transfer is no longer awaiting review.');
    await c.query(
      'INSERT INTO review_decisions(transfer_id,reviewer_id,decision,rationale) VALUES($1,$2,$3,$4)',
      [id, actor, decision, rationale],
    );
    if (decision === 'REJECT')
      await c.query("UPDATE transfers SET status='REJECTED',updated_at=now() WHERE id=$1", [id]);
    else
      await complete(c, t, await lockWallets(c, [t.sender_id, t.recipient_id]), actor, requestId);
    await audit(c, actor, `REVIEW_${decision}`, id, requestId, { rationale });
    return (await c.query('SELECT * FROM transfers WHERE id=$1', [id])).rows[0];
  });
}
export async function reverse(
  actor: string,
  id: string,
  key: string,
  rationale: string,
  requestId: string,
) {
  return transaction((c) =>
    idempotent(c, actor, 'reversal', key, { id, rationale }, async () => {
      return reverseInTransaction(c, actor, id, rationale, requestId);
    }),
  );
}

// All callers lock the transfer before the request, then wallets in deterministic order.
// This is the single money-moving reversal implementation.
export async function reverseInTransaction(
  c: PoolClient,
  actor: string,
  id: string,
  rationale: string,
  requestId: string,
) {
  const t = (await c.query<Transfer>('SELECT * FROM transfers WHERE id=$1 FOR UPDATE', [id]))
    .rows[0];
  if (!t || t.status !== 'COMPLETED')
    throw new ApiError(409, 'NOT_REVERSIBLE', 'Only completed transfers can be reversed.');
  if ((await c.query('SELECT id FROM reversals WHERE transfer_id=$1', [id])).rowCount)
    throw new ApiError(409, 'ALREADY_REVERSED', 'Transfer already reversed.');
  const wallets = await lockWallets(c, [t.sender_id, t.recipient_id]);
  const sender = wallets.find((w) => w.owner_id === t.sender_id)!;
  const recipient = wallets.find((w) => w.owner_id === t.recipient_id)!;
  if (
    (
      await c.query("SELECT id FROM users WHERE id=ANY($1::uuid[]) AND status='ACTIVE'", [
        [t.sender_id, t.recipient_id],
      ])
    ).rowCount !== 2 ||
    wallets.some((w) => w.status !== 'ACTIVE')
  )
    throw new ApiError(409, 'REVERSAL_UNAVAILABLE', 'Both accounts and wallets must be active.');
  // Honor earlier queued refunds; a direct reversal cannot spend their reserved funds.
  const current = (
    await c.query(
      "SELECT id,queued_at FROM reversal_requests WHERE original_transfer_id=$1 AND status='QUEUED'",
      [id],
    )
  ).rows[0];
  const reserved = (
    await c.query(
      `SELECT COALESCE(sum(t.amount),0)::text AS amount FROM reversal_requests q JOIN transfers t ON t.id=q.original_transfer_id
    WHERE q.status='QUEUED' AND t.recipient_id=$1 AND t.id<>$2
    AND ($3::timestamptz IS NULL OR (q.queued_at,q.id)<($3::timestamptz,$4::uuid))`,
      [t.recipient_id, id, current?.queued_at ?? null, current?.id ?? null],
    )
  ).rows[0].amount;
  if (BigInt(recipient.balance) - BigInt(reserved) < BigInt(t.amount))
    throw new ApiError(
      409,
      'REVERSAL_FUNDS_PENDING',
      'Insufficient unreserved recipient funds. An approved user request can wait in the refund queue.',
    );
  const reversalId = randomUUID();
  const journal = await post(
    c,
    'REVERSAL',
    `reverse-${id}`,
    recipient.account_id,
    sender.account_id,
    BigInt(t.amount),
  );
  await c.query(
    'INSERT INTO reversals(id,transfer_id,reviewer_id,rationale,journal_id) VALUES($1,$2,$3,$4,$5)',
    [reversalId, id, actor, rationale, journal],
  );
  await audit(c, actor, 'TRANSFER_REVERSED', id, requestId, { rationale });
  await event(c, 'transfer.reversed', id);
  const resolved = await c.query(
    `UPDATE reversal_requests SET status='APPROVED', reversal_id=$2,
        reviewed_by=$3, reviewed_at=COALESCE(reviewed_at,now()), updated_at=now(), decision_reason=$4
        WHERE original_transfer_id=$1 AND status IN ('PENDING','QUEUED') RETURNING id`,
    [id, reversalId, actor, rationale],
  );
  for (const request of resolved.rows)
    await audit(c, actor, 'REVERSAL_REQUEST_RESOLVED', request.id, requestId, {
      reversalId,
      transferId: id,
    });
  return { id: reversalId, transferId: id, journalId: journal };
}
