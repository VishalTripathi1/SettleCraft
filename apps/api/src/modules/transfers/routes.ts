import { Router } from 'express';
import { z } from 'zod';
import { amountSchema, parseAmount } from '@settlecraft/shared';
import { pool, transaction } from '../../db/pool.js';
import { authenticate, admin } from '../auth/service.js';
import { transfer, review, reverse } from './service.js';
import { requestTopup, decideTopup, reconcile } from '../admin/service.js';
import { audit } from '../ledger/service.js';
import { rules } from '../risk/service.js';
import { ApiError } from '../../middleware/errors.js';
export const domainRouter = Router();
domainRouter.use(authenticate);
const id = (v: unknown) => z.uuid().parse(v);
const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  status: z.enum(['COMPLETED', 'PENDING_REVIEW', 'REJECTED', 'FAILED']).optional(),
  search: z.string().max(100).default(''),
});
const decision = z
  .object({ decision: z.enum(['APPROVE', 'REJECT']), rationale: z.string().trim().min(5).max(500) })
  .strict();
const key = (v: string | undefined) => {
  if (!v) throw new ApiError(422, 'IDEMPOTENCY_REQUIRED', 'An Idempotency-Key is required.');
  return v;
};
domainRouter.get('/users/lookup', async (req, res) => {
  const email = z.email().parse(req.query.email).toLowerCase();
  const r = await pool.query(
    "SELECT id,name,email FROM users WHERE email=$1 AND id<>$2 AND status='ACTIVE' AND role='USER'",
    [email, res.locals.user.id],
  );
  if (!r.rows[0])
    throw new ApiError(404, 'RECIPIENT_NOT_FOUND', 'No available recipient found for that email.');
  res.json(r.rows[0]);
});
domainRouter.patch('/users/me', async (req, res) => {
  const { name } = z
    .object({ name: z.string().trim().min(2).max(80) })
    .strict()
    .parse(req.body);
  await transaction(async (c) => {
    await c.query('UPDATE users SET name=$1,updated_at=now() WHERE id=$2', [
      name,
      res.locals.user.id,
    ]);
    await audit(c, res.locals.user.id, 'PROFILE_UPDATED', res.locals.user.id, res.locals.requestId);
  });
  res.json({ ...res.locals.user, name });
});
domainRouter.post('/transfers', async (req, res) =>
  res
    .status(201)
    .json(
      await transfer(
        res.locals.user.id,
        key(req.get('Idempotency-Key')),
        req.body,
        res.locals.requestId,
      ),
    ),
);
async function listTransfers(
  req: import('express').Request,
  res: import('express').Response,
  isAdmin: boolean,
) {
  const p = pagination.parse(req.query);
  const values = [
    isAdmin ? null : res.locals.user.id,
    p.status ?? null,
    `%${p.search}%`,
    20,
    (p.page - 1) * 20,
  ];
  const r = await pool.query(
    `SELECT t.*,s.name AS sender_name,r.name AS recipient_name,count(*) OVER()::int AS total FROM transfers t JOIN users s ON s.id=t.sender_id JOIN users r ON r.id=t.recipient_id WHERE ($1::uuid IS NULL OR t.sender_id=$1 OR t.recipient_id=$1) AND ($2::text IS NULL OR t.status=$2) AND (t.reference ILIKE $3 OR s.name ILIKE $3 OR r.name ILIKE $3 OR t.note ILIKE $3) ORDER BY t.created_at DESC,t.id DESC LIMIT $4 OFFSET $5`,
    values,
  );
  res.json({ items: r.rows, total: r.rows[0]?.total ?? 0, page: p.page, pageSize: 20 });
}
domainRouter.get('/transfers', (req, res) => listTransfers(req, res, false));
domainRouter.get('/transfers/:id', async (req, res) => {
  const r = await pool.query(
    'SELECT t.*,s.name AS sender_name,r.name AS recipient_name FROM transfers t JOIN users s ON s.id=t.sender_id JOIN users r ON r.id=t.recipient_id WHERE t.id=$1 AND (t.sender_id=$2 OR t.recipient_id=$2 OR $3::boolean)',
    [id(req.params.id), res.locals.user.id, res.locals.user.role === 'ADMIN'],
  );
  const t = r.rows[0];
  if (!t) throw new ApiError(404, 'NOT_FOUND', 'Transfer not found.');
  const [entries, decisions, reversals] = await Promise.all([
    pool.query(
      'SELECT direction,amount::text,currency,account_id FROM ledger_entries WHERE journal_id=$1 ORDER BY direction',
      [t.journal_id],
    ),
    pool.query('SELECT decision,rationale,created_at FROM review_decisions WHERE transfer_id=$1', [
      t.id,
    ]),
    pool.query('SELECT id,journal_id,rationale,created_at FROM reversals WHERE transfer_id=$1', [
      t.id,
    ]),
  ]);
  let risk: unknown = null;
  if (res.locals.user.role === 'ADMIN')
    risk = (await pool.query('SELECT * FROM risk_assessments WHERE transfer_id=$1', [t.id]))
      .rows[0];
  res.json({
    ...t,
    entries: entries.rows,
    decisions: decisions.rows,
    reversals: reversals.rows,
    risk,
  });
});
domainRouter.get('/wallets/me/ledger-activity', async (req, res) => {
  const { page } = pagination.parse(req.query);
  const r = await pool.query(
    'SELECT e.direction,e.amount::text,j.kind,j.reference,j.created_at,j.id FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id JOIN wallets w ON w.id=a.wallet_id JOIN ledger_journals j ON j.id=e.journal_id WHERE w.owner_id=$1 ORDER BY j.created_at DESC,j.id DESC LIMIT 20 OFFSET $2',
    [res.locals.user.id, (page - 1) * 20],
  );
  res.json(r.rows);
});
domainRouter.get('/wallets/me/demo-topups', async (_req, res) =>
  res.json(
    (
      await pool.query('SELECT * FROM topups WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [
        res.locals.user.id,
      ])
    ).rows,
  ),
);
domainRouter.post('/wallets/me/demo-topups', async (req, res) => {
  const data = z.object({ amount: amountSchema }).strict().parse(req.body);
  res
    .status(201)
    .json(
      await requestTopup(
        res.locals.user.id,
        key(req.get('Idempotency-Key')),
        parseAmount(data.amount),
        res.locals.requestId,
      ),
    );
});
domainRouter.use('/admin', admin);
domainRouter.get('/admin/transfers', (req, res) => listTransfers(req, res, true));
domainRouter.get('/admin/reviews', async (_req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT t.*,s.name AS sender_name,r.name AS recipient_name,a.score,a.signals,a.rule_version FROM transfers t JOIN users s ON s.id=t.sender_id JOIN users r ON r.id=t.recipient_id JOIN risk_assessments a ON a.transfer_id=t.id WHERE t.status='PENDING_REVIEW' ORDER BY t.created_at,t.id LIMIT 100",
      )
    ).rows,
  ),
);
domainRouter.post('/admin/reviews/:id', async (req, res) => {
  const d = decision.parse(req.body);
  res.json(
    await review(
      res.locals.user.id,
      id(req.params.id),
      d.decision,
      d.rationale,
      res.locals.requestId,
    ),
  );
});
domainRouter.get('/admin/topups', async (_req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT t.*,u.name,u.email FROM topups t JOIN users u ON u.id=t.user_id WHERE t.status='PENDING_REVIEW' ORDER BY t.created_at LIMIT 100",
      )
    ).rows,
  ),
);
domainRouter.post('/admin/topups/:id', async (req, res) => {
  const d = decision.parse(req.body);
  res.json(
    await decideTopup(
      res.locals.user.id,
      id(req.params.id),
      d.decision,
      d.rationale,
      res.locals.requestId,
    ),
  );
});
domainRouter.post('/admin/transfers/:id/reverse', async (req, res) => {
  const { rationale } = z
    .object({ rationale: z.string().trim().min(5).max(500) })
    .strict()
    .parse(req.body);
  res.json(
    await reverse(
      res.locals.user.id,
      id(req.params.id),
      key(req.get('Idempotency-Key')),
      rationale,
      res.locals.requestId,
    ),
  );
});
domainRouter.get('/admin/risk-rules', (_req, res) =>
  res.json({ version: '1.0', reviewThreshold: 60, rules }),
);
domainRouter.get('/admin/audit', async (req, res) => {
  const p = pagination.parse(req.query);
  res.json(
    (
      await pool.query(
        'SELECT a.*,u.name AS actor_name FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE a.action ILIKE $1 ORDER BY a.created_at DESC,a.id DESC LIMIT 30 OFFSET $2',
        [`%${p.search}%`, (p.page - 1) * 30],
      )
    ).rows,
  );
});
domainRouter.get('/admin/reconciliation', async (_req, res) =>
  res.json(
    (await pool.query('SELECT * FROM reconciliation_runs ORDER BY created_at DESC LIMIT 10')).rows,
  ),
);
domainRouter.post('/admin/reconciliation/run', async (_req, res) =>
  res.json(await reconcile(res.locals.user.id, res.locals.requestId)),
);
domainRouter.get('/admin/overview', async (_req, res) => {
  const totals = (
    await pool.query(
      "SELECT count(*)::int AS total,count(*) FILTER(WHERE status='COMPLETED')::int AS completed,count(*) FILTER(WHERE status='PENDING_REVIEW')::int AS held,count(*) FILTER(WHERE status='FAILED')::int AS failed,COALESCE(sum(amount) FILTER(WHERE status='COMPLETED'),0)::text AS volume FROM transfers",
    )
  ).rows[0];
  const daily = (
    await pool.query(
      "SELECT d::date::text AS day,count(t.id)::int AS count,COALESCE(sum(t.amount),0)::text AS volume FROM generate_series((now() AT TIME ZONE 'UTC')::date-6,(now() AT TIME ZONE 'UTC')::date,interval '1 day') d LEFT JOIN transfers t ON (t.created_at AT TIME ZONE 'UTC')::date=d::date AND t.status='COMPLETED' GROUP BY d ORDER BY d",
    )
  ).rows;
  const jobs = (
    await pool.query(
      'SELECT count(*) FILTER(WHERE delivered_at IS NULL)::int AS pending,count(*) FILTER(WHERE delivered_at IS NOT NULL)::int AS delivered,COALESCE(sum(attempts),0)::int AS attempts FROM outbox_events',
    )
  ).rows[0];
  res.json({ ...totals, daily, jobs });
});

domainRouter.get('/admin/events', async (_req, res) =>
  res.json(
    (
      await pool.query(
        'SELECT e.*, (SELECT count(*)::int FROM webhook_receipts r WHERE r.event_id=e.id) AS receipt_count FROM outbox_events e ORDER BY e.created_at DESC LIMIT 30',
      )
    ).rows,
  ),
);
