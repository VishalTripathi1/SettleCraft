import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
beforeAll(async () => {
  await migrate();
});
afterAll(() => pool.end());
it('rejects unbalanced journals at the transaction boundary', async () => {
  await expect(
    transaction(async (c) => {
      await c.query("INSERT INTO ledger_journals(kind,reference) VALUES('DEMO_ISSUANCE',$1)", [
        randomUUID(),
      ]);
    }),
  ).rejects.toThrow('balanced');
});
it('posts balanced journals and prohibits edits and late insertions', async () => {
  const id = randomUUID();
  await transaction(async (c) => {
    const account = await c.query("SELECT id FROM ledger_accounts WHERE category='SYSTEM_OFFSET'");
    await c.query("INSERT INTO ledger_journals(id,kind,reference) VALUES($1,'DEMO_ISSUANCE',$2)", [
      id,
      randomUUID(),
    ]);
    await c.query(
      "INSERT INTO ledger_entries(journal_id,account_id,direction,amount) VALUES($1,$2,'DEBIT',100),($1,$2,'CREDIT',100)",
      [id, account.rows[0].id],
    );
  });
  await expect(
    pool.query('UPDATE ledger_entries SET amount=50 WHERE journal_id=$1', [id]),
  ).rejects.toThrow('Append-only');
  await expect(pool.query('DELETE FROM ledger_journals WHERE id=$1', [id])).rejects.toThrow(
    'Append-only',
  );
  await expect(
    pool.query(
      "INSERT INTO ledger_entries(journal_id,account_id,direction,amount) SELECT $1,id,'CREDIT',100 FROM ledger_accounts WHERE category='SYSTEM_OFFSET'",
      [id],
    ),
  ).rejects.toThrow('committed');
});
