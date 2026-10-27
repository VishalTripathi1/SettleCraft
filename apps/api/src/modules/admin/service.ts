import { randomUUID } from 'node:crypto';
import { transaction } from '../../db/pool.js';
import { ApiError } from '../../middleware/errors.js';
import { lockWallets, post, audit } from '../ledger/service.js';
import { idempotent, event } from '../transfers/service.js';
export async function requestTopup(actor: string, key: string, amount: bigint, requestId: string) {
  if (amount <= 0n || amount > 1000000n)
    throw new ApiError(422, 'TOPUP_LIMIT', 'Request between ₹0.01 and ₹10,000.');
  return transaction((c) =>
    idempotent(c, actor, 'topup', key, { amount: amount.toString() }, async () => {
      const wallets = await lockWallets(c, [actor]);
      if (wallets[0]!.status !== 'ACTIVE')
        throw new ApiError(409, 'WALLET_FROZEN', 'Wallet is frozen.');
      const recent = await c.query<{ total: string }>(
        "SELECT COALESCE(sum(amount),0)::text AS total FROM topups WHERE user_id=$1 AND created_at>now()-interval '1 day' AND status<>'REJECTED'",
        [actor],
      );
      if (BigInt(recent.rows[0]!.total) + amount > 2000000n)
        throw new ApiError(
          429,
          'DAILY_LIMIT',
          'Demo funding is limited to ₹20,000 in a rolling 24 hours.',
        );
      const r = await c.query('INSERT INTO topups(user_id,amount) VALUES($1,$2) RETURNING *', [
        actor,
        amount.toString(),
      ]);
      await audit(c, actor, 'TOPUP_REQUESTED', r.rows[0].id, requestId);
      return r.rows[0];
    }),
  );
}
export async function decideTopup(
  actor: string,
  id: string,
  decision: 'APPROVE' | 'REJECT',
  rationale: string,
  requestId: string,
) {
  return transaction(async (c) => {
    const t = (
      await c.query<{ id: string; user_id: string; amount: string; status: string }>(
        'SELECT * FROM topups WHERE id=$1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!t) throw new ApiError(404, 'NOT_FOUND', 'Funding request not found.');
    if (t.status !== 'PENDING_REVIEW')
      throw new ApiError(409, 'ALREADY_DECIDED', 'Funding request was already decided.');
    let journal: string | null = null;
    if (decision === 'APPROVE') {
      const w = (await lockWallets(c, [t.user_id]))[0]!;
      if (w.status !== 'ACTIVE') throw new ApiError(409, 'WALLET_FROZEN', 'Wallet is frozen.');
      const offset = (
        await c.query<{ id: string }>(
          "SELECT id FROM ledger_accounts WHERE category='SYSTEM_OFFSET'",
        )
      ).rows[0]!;
      journal = await post(
        c,
        'DEMO_ISSUANCE',
        `topup-${id}`,
        offset.id,
        w.account_id,
        BigInt(t.amount),
      );
      await event(c, 'topup.completed', id);
    }
    await c.query(
      'UPDATE topups SET status=$2,reviewer_id=$3,rationale=$4,journal_id=$5 WHERE id=$1',
      [id, decision === 'APPROVE' ? 'COMPLETED' : 'REJECTED', actor, rationale, journal],
    );
    await audit(c, actor, `TOPUP_${decision}`, id, requestId, { rationale });
    return { id, status: decision === 'APPROVE' ? 'COMPLETED' : 'REJECTED' };
  });
}
export async function reconcile(actor: string, requestId: string) {
  return transaction(async (c) => {
    await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const totals = (
      await c.query<{ debits: string; credits: string }>(
        "SELECT COALESCE(sum(amount) FILTER(WHERE direction='DEBIT'),0)::text AS debits,COALESCE(sum(amount) FILTER(WHERE direction='CREDIT'),0)::text AS credits FROM ledger_entries",
      )
    ).rows[0]!;
    const unbalanced = (
      await c.query(
        "SELECT j.id FROM ledger_journals j LEFT JOIN ledger_entries e ON e.journal_id=j.id GROUP BY j.id HAVING count(e.id)<2 OR sum(CASE WHEN e.direction='DEBIT' THEN e.amount ELSE -e.amount END)<>0",
      )
    ).rows;
    const negative = (
      await c.query('SELECT wallet_id FROM wallet_balances WHERE balance::numeric<0')
    ).rows;
    const result = {
      ...totals,
      unbalancedJournals: unbalanced.map((r) => r.id),
      negativeWallets: negative.map((r) => r.wallet_id),
      passed: totals.debits === totals.credits && !unbalanced.length && !negative.length,
      projection: 'Ledger-derived balances; no mutable balance cache',
    };
    const id = randomUUID();
    await c.query('INSERT INTO reconciliation_runs(id,actor_id,result) VALUES($1,$2,$3)', [
      id,
      actor,
      JSON.stringify(result),
    ]);
    await audit(c, actor, 'RECONCILIATION_RUN', id, requestId, { passed: result.passed });
    return { id, ...result };
  });
}
