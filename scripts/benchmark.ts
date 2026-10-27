import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { cpus, platform, arch, totalmem } from 'node:os';
import { writeFile } from 'node:fs/promises';
config({ quiet: true });
const db = process.env.TEST_DATABASE_URL;
if (!db || new URL(db).pathname !== '/settlecraft_test')
  throw new Error('Benchmark only runs against settlecraft_test');
process.env.DATABASE_URL = db;
process.env.NODE_ENV = 'test';
const { pool, transaction } = await import('../apps/api/src/db/pool.js');
const { migrate } = await import('../apps/api/src/db/migrate.js');
const { provision } = await import('../apps/api/src/modules/ledger/service.js');
const { session } = await import('../apps/api/src/modules/auth/service.js');
const { createApp } = await import('../apps/api/src/app.js');
const usersCount = Number(process.env.BENCH_USERS ?? 10),
  count = Number(process.env.BENCH_TRANSFERS ?? 100),
  concurrency = Number(process.env.BENCH_CONCURRENCY ?? 10);
if (
  !Number.isInteger(usersCount) ||
  usersCount < 2 ||
  usersCount > 50 ||
  !Number.isInteger(count) ||
  count < 1 ||
  count > 200 ||
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 50
)
  throw new Error(
    'Use 2–50 users, 1–200 transfers, 1–50 concurrency. Bounded to preserve the API rate limit.',
  );
await migrate();
const users: { id: string; token: string }[] = [];
for (let i = 0; i < usersCount; i++) {
  users.push(
    await transaction(async (c) => {
      const u = (
        await c.query(
          "INSERT INTO users(name,email,password_hash,created_at) VALUES('Benchmark user',$1,'not-a-login',now()-interval '2 days') RETURNING id,name,email,role",
          [`${randomUUID()}@benchmark.local`],
        )
      ).rows[0];
      await provision(c, u.id, 1000000n);
      return { id: u.id, token: (await session(c, u)).accessToken };
    }),
  );
}
const server = createApp().listen(0, '127.0.0.1');
await new Promise<void>((r) => server.on('listening', r));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No test listener');
const url = `http://127.0.0.1:${address.port}/api/v1/transfers`;
const requests = Array.from({ length: count }, (_, i) => ({
  user: users[i % usersCount]!,
  key: randomUUID(),
  body: {
    recipientId: users[(i + 1) % usersCount]!.id,
    amount: '1.00',
    currency: 'INR',
    note: 'Measured synthetic benchmark',
  },
}));
const samples: number[] = [];
let unexpected = 0;
const ids = new Set<string>();
async function send(item: (typeof requests)[number], expected = 201) {
  const start = performance.now();
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${item.user.token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': item.key,
    },
    body: JSON.stringify(item.body),
  });
  const data = await r.json();
  samples.push(performance.now() - start);
  if (r.status !== expected || (expected === 201 && data.status !== 'COMPLETED')) unexpected++;
  if (data.id) ids.add(data.id);
  return r.status;
}
const started = performance.now();
for (let i = 0; i < requests.length; i += concurrency)
  await Promise.all(requests.slice(i, i + concurrency).map((item) => send(item)));
const duplicates = Math.min(20, count);
await Promise.all(requests.slice(0, duplicates).map((item) => send(item)));
const conflicts = Math.min(10, count);
await Promise.all(
  requests
    .slice(0, conflicts)
    .map((item) => send({ ...item, body: { ...item.body, amount: '2.00' } }, 409)),
);
const elapsed = performance.now() - started;
samples.sort((a, b) => a - b);
const totals = (
  await pool.query(
    'SELECT count(*)::int AS transfers,count(journal_id)::int AS journals FROM transfers WHERE sender_id=ANY($1::uuid[])',
    [users.map((u) => u.id)],
  )
).rows[0];
const balances = (
  await pool.query(
    'SELECT sum(balance::numeric)::text AS total,min(balance::numeric)::text AS minimum FROM wallet_balances WHERE owner_id=ANY($1::uuid[])',
    [users.map((u) => u.id)],
  )
).rows[0];
const unbalanced = (
  await pool.query(
    "SELECT journal_id FROM ledger_entries GROUP BY journal_id HAVING sum(CASE WHEN direction='DEBIT' THEN amount ELSE -amount END)<>0",
  )
).rowCount;
const result = {
  measuredAt: new Date().toISOString(),
  environment: {
    cpu: cpus()[0]?.model,
    platform: platform(),
    arch: arch(),
    memoryGiB: Math.round(totalmem() / 2 ** 30),
    node: process.version,
    postgres: (await pool.query('SHOW server_version')).rows[0].server_version,
    transport:
      'loopback HTTP, Express auth+validation+PostgreSQL; warm local DB; no external clients',
  },
  parameters: {
    users: usersCount,
    uniqueIntents: count,
    concurrency,
    duplicateRequests: duplicates,
    conflictingRequests: conflicts,
    amount: 'INR 1.00',
  },
  metrics: {
    elapsedMs: Math.round(elapsed),
    httpRequests: samples.length,
    requestsPerSecond: Number((samples.length / (elapsed / 1000)).toFixed(2)),
    p50Ms: Number(samples[Math.floor(samples.length * 0.5)]!.toFixed(2)),
    p95Ms: Number(samples[Math.floor(samples.length * 0.95)]!.toFixed(2)),
    unexpectedErrors: unexpected,
    uniqueResponseIds: ids.size,
    ...totals,
    unbalancedJournals: unbalanced,
    finalBalancePaise: balances.total,
    expectedBalancePaise: (BigInt(usersCount) * 1000000n).toString(),
    minimumWalletPaise: balances.minimum,
  },
};
await writeFile('docs/benchmark-results.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
await new Promise<void>((resolve) => server.close(() => resolve()));
await pool.end();
if (
  unexpected ||
  totals.journals !== count ||
  unbalanced ||
  balances.total !== (BigInt(usersCount) * 1000000n).toString()
)
  process.exitCode = 1;
