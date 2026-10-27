import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../middleware/errors.js';
export async function audit(
  c: PoolClient,
  actor: string | null,
  action: string,
  entity: string | null,
  requestId: string,
  metadata: Record<string, unknown> = {},
) {
  await c.query(
    'INSERT INTO audit_events(actor_id,action,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5)',
    [actor, action, entity, requestId, JSON.stringify(metadata)],
  );
}
export async function post(
  c: PoolClient,
  kind: 'DEMO_ISSUANCE' | 'TRANSFER' | 'REVERSAL',
  reference: string,
  debit: string,
  credit: string,
  amount: bigint,
) {
  if (amount <= 0n || debit === credit)
    throw new ApiError(
      422,
      'INVALID_POSTING',
      'Posting must have positive value and distinct accounts.',
    );
  const id = randomUUID();
  await c.query('INSERT INTO ledger_journals(id,kind,reference) VALUES($1,$2,$3)', [
    id,
    kind,
    reference,
  ]);
  await c.query(
    "INSERT INTO ledger_entries(journal_id,account_id,direction,amount) VALUES($1,$2,'DEBIT',$4),($1,$3,'CREDIT',$4)",
    [id, debit, credit, amount.toString()],
  );
  return id;
}
export async function provision(c: PoolClient, userId: string, amount = 0n) {
  const wallet = await c.query<{ id: string }>(
    'INSERT INTO wallets(owner_id) VALUES($1) RETURNING id',
    [userId],
  );
  const account = await c.query<{ id: string }>(
    "INSERT INTO ledger_accounts(wallet_id,category) VALUES($1,'WALLET_LIABILITY') RETURNING id",
    [wallet.rows[0]!.id],
  );
  if (amount > 0n) {
    const offset = await c.query<{ id: string }>(
      "SELECT id FROM ledger_accounts WHERE category='SYSTEM_OFFSET'",
    );
    await post(
      c,
      'DEMO_ISSUANCE',
      `initial-${userId}`,
      offset.rows[0]!.id,
      account.rows[0]!.id,
      amount,
    );
  }
  return wallet.rows[0]!.id;
}
export type Wallet = {
  id: string;
  owner_id: string;
  status: string;
  account_id: string;
  balance: string;
};
export async function lockWallets(c: PoolClient, owners: string[]) {
  const locked = await c.query<{ id: string }>(
    'SELECT id FROM wallets WHERE owner_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [owners],
  );
  if (locked.rowCount !== new Set(owners).size)
    throw new ApiError(404, 'WALLET_NOT_FOUND', 'Wallet not found.');
  const result = await c.query<Wallet>(
    'SELECT w.id,w.owner_id,w.status,a.id AS account_id,b.balance FROM wallets w JOIN ledger_accounts a ON a.wallet_id=w.id JOIN wallet_balances b ON b.wallet_id=w.id WHERE w.owner_id=ANY($1::uuid[])',
    [owners],
  );
  return result.rows;
}
