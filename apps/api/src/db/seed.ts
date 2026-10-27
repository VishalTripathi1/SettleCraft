import { pool, transaction } from './pool.js';
import { hashPassword } from '../modules/auth/service.js';
import { provision, audit } from '../modules/ledger/service.js';
import { transfer } from '../modules/transfers/service.js';
import { env } from '../config/env.js';
export async function seed() {
  const hash = await hashPassword(env.DEMO_PASSWORD);
  await transaction(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(43210002)');
    for (const [name, email, role, amount] of [
      ['Rahul Sharma', 'rahul@settlecraft.local', 'USER', 200000n],
      ['Priya Mehta', 'priya@settlecraft.local', 'USER', 100000n],
      ['Aarav Patel', 'aarav@settlecraft.local', 'USER', 2000000n],
      ['Neha Kapoor', 'neha@settlecraft.local', 'USER', 500000n],
      ['Demo Admin', 'admin@settlecraft.local', 'ADMIN', 0n],
    ] as const) {
      const old = await c.query('SELECT id FROM users WHERE email=$1', [email]);
      if (old.rowCount) continue;
      const u = await c.query<{ id: string }>(
        'INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id',
        [name, email, hash, role],
      );
      await provision(c, u.rows[0]!.id, amount);
      await audit(c, u.rows[0]!.id, 'DEMO_SEEDED', u.rows[0]!.id, 'local-seed');
    }
  });
  const people = (
    await pool.query<{ id: string; email: string }>(
      "SELECT id,email FROM users WHERE email IN ('aarav@settlecraft.local','neha@settlecraft.local')",
    )
  ).rows;
  const aarav = people.find((u) => u.email === 'aarav@settlecraft.local')!,
    neha = people.find((u) => u.email === 'neha@settlecraft.local')!;
  await transfer(
    aarav.id,
    'seed-ordinary-v1',
    {
      recipientId: neha.id,
      amount: '250.00',
      currency: 'INR',
      note: 'Synthetic demo · shared supplies',
    },
    'local-seed',
  );
  await transfer(
    aarav.id,
    'seed-review-v1',
    {
      recipientId: neha.id,
      amount: '10000.00',
      currency: 'INR',
      note: 'Synthetic demo · large equipment purchase',
    },
    'local-seed',
  );
  console.log(
    'Synthetic accounts ready: rahul, priya, aarav, admin @settlecraft.local. Password comes from DEMO_PASSWORD in .env. Existing accounts were preserved.',
  );
}
if (process.argv[1]?.endsWith('seed.ts'))
  seed()
    .then(() => pool.end())
    .catch(async (e) => {
      console.error(e);
      await pool.end();
      process.exitCode = 1;
    });
