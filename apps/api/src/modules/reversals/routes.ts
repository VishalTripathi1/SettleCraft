import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../../db/pool.js';
import { ApiError } from '../../middleware/errors.js';
import { admin } from '../auth/service.js';
import { submitRequest, decideRequest, eligibility } from './service.js';
export const reversalRouter = Router();
const id = (v: unknown) => z.uuid().parse(v);
const filters = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  search: z.string().max(100).default(''),
  status: z.enum(['PENDING', 'QUEUED', 'APPROVED', 'REJECTED', 'FAILED']).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  transferId: z.uuid().optional(),
});
const joined = `SELECT q.*,t.reference AS transfer_reference,t.amount::text,t.currency,t.created_at AS transfer_created_at,
 t.sender_id,t.recipient_id,t.status AS transfer_status,s.name AS sender_name,d.name AS recipient_name,u.name AS reviewer_name
 FROM reversal_requests q JOIN transfers t ON t.id=q.original_transfer_id JOIN users s ON s.id=t.sender_id
 JOIN users d ON d.id=t.recipient_id LEFT JOIN users u ON u.id=q.reviewed_by`;
async function list(raw: unknown, actor: string | null) {
  const f = filters.parse(raw);
  const r = await pool.query(
    `WITH filtered AS (${joined} WHERE ($1::uuid IS NULL OR q.requester_id=$1)
    AND ($2::text IS NULL OR q.status=$2) AND (q.reference ILIKE $3 OR t.reference ILIKE $3 OR s.name ILIKE $3 OR d.name ILIKE $3)
    AND ($4::date IS NULL OR q.created_at >= $4::date) AND ($5::date IS NULL OR q.created_at < $5::date+interval '1 day')
    AND ($6::uuid IS NULL OR q.original_transfer_id=$6)), paged AS (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $7)
    SELECT (SELECT count(*)::int FROM filtered) AS total,COALESCE((SELECT jsonb_agg(paged ORDER BY created_at DESC,id DESC) FROM paged),'[]') AS items`,
    [
      actor,
      f.status ?? null,
      `%${f.search}%`,
      f.from ?? null,
      f.to ?? null,
      f.transferId ?? null,
      (f.page - 1) * 20,
    ],
  );
  return { ...r.rows[0], page: f.page, pageSize: 20 };
}
async function detail(requestId: string, actor: string | null) {
  const r = (
    await pool.query(`${joined} WHERE q.id=$1 AND ($2::uuid IS NULL OR q.requester_id=$2)`, [
      requestId,
      actor,
    ])
  ).rows[0];
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Reversal request not found.');
  const eligible = await eligibility(r.original_transfer_id);
  const reversals = (
    await pool.query('SELECT * FROM reversals WHERE transfer_id=$1', [r.original_transfer_id])
  ).rows;
  const risk =
    actor === null
      ? (
          await pool.query('SELECT * FROM risk_assessments WHERE transfer_id=$1', [
            r.original_transfer_id,
          ])
        ).rows[0]
      : undefined;
  const audits =
    actor === null
      ? (
          await pool.query(
            'SELECT * FROM audit_events WHERE entity_id=ANY($1::uuid[]) ORDER BY created_at,id',
            [[r.id, r.original_transfer_id]],
          )
        ).rows
      : undefined;
  return { ...r, eligible, reversals, risk, audits };
}
const writeLimit = rateLimit({
  windowMs: 60000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({
      code: 'RATE_LIMITED',
      message: 'Too many reversal requests. Try again shortly.',
      requestId: res.locals.requestId,
    }),
});
reversalRouter.post('/transfers/:id/reversal-requests', writeLimit, async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (!key) throw new ApiError(422, 'IDEMPOTENCY_REQUIRED', 'An Idempotency-Key is required.');
  res
    .status(201)
    .json(
      await submitRequest(
        res.locals.user.id,
        id(req.params.id),
        key,
        req.body,
        res.locals.requestId,
      ),
    );
});
reversalRouter.get('/reversal-requests', async (req, res) =>
  res.json(await list(req.query, res.locals.user.id)),
);
reversalRouter.get('/reversal-requests/:id', async (req, res) =>
  res.json(await detail(id(req.params.id), res.locals.user.id)),
);
reversalRouter.get('/transfers/:id/reversal-requests', async (req, res) =>
  res.json(await list({ ...req.query, transferId: id(req.params.id) }, res.locals.user.id)),
);
reversalRouter.get('/admin/reversal-requests', admin, async (req, res) =>
  res.json(await list(req.query, null)),
);
reversalRouter.get('/admin/reversal-requests/:id', admin, async (req, res) =>
  res.json(await detail(id(req.params.id), null)),
);
reversalRouter.post(
  '/admin/reversal-requests/:id/decision',
  admin,
  writeLimit,
  async (req, res) => {
    const d = z
      .object({
        decision: z.enum(['APPROVE', 'REJECT']),
        rationale: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(req.body);
    res.json(
      await decideRequest(
        res.locals.user.id,
        id(req.params.id),
        d.decision,
        d.rationale,
        res.locals.requestId,
      ),
    );
  },
);

// One database result set for stable pagination of original payments and compensating postings.
const historyFilters = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  search: z.string().max(100).default(''),
  type: z.enum(['TRANSFER', 'REVERSAL']).optional(),
  direction: z.enum(['INCOMING', 'OUTGOING']).optional(),
  status: z
    .enum([
      'COMPLETED',
      'PENDING_REVIEW',
      'PENDING_VERIFICATION',
      'FAILED',
      'REJECTED',
      'CREATED',
      'PROCESSING',
    ])
    .optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export async function history(raw: unknown, actor: string | null) {
  const f = historyFilters.parse(raw);
  const result = await pool.query(
    `WITH events AS (
 SELECT 'TRANSFER:'||t.id AS history_id,'TRANSFER'::text AS type,t.id,t.id AS transfer_id,t.sender_id,t.recipient_id,t.amount::text,t.currency,t.note,t.reference,t.reference AS original_reference,t.status,t.created_at,t.updated_at,t.journal_id,NULL::uuid AS request_id
 FROM transfers t WHERE ($1::uuid IS NULL OR t.sender_id=$1 OR t.recipient_id=$1)
 UNION ALL
 SELECT 'REVERSAL:'||r.id,'REVERSAL',r.id,t.id,t.recipient_id,t.sender_id,
 (SELECT sum(e.amount)::text FROM ledger_entries e WHERE e.journal_id=r.journal_id AND e.direction='CREDIT'),t.currency,r.rationale,j.reference,t.reference,'COMPLETED',j.created_at,j.created_at,r.journal_id,q.id
 FROM reversals r JOIN transfers t ON t.id=r.transfer_id JOIN ledger_journals j ON j.id=r.journal_id
 LEFT JOIN reversal_requests q ON q.reversal_id=r.id
 WHERE ($1::uuid IS NULL OR t.sender_id=$1 OR t.recipient_id=$1)
 ), enriched AS (SELECT e.*,s.name AS sender_name,d.name AS recipient_name,
 CASE WHEN $1::uuid IS NULL THEN NULL WHEN e.sender_id=$1 THEN 'OUTGOING' ELSE 'INCOMING' END AS direction,
 CASE WHEN e.sender_id=$1 THEN '-'||e.amount ELSE e.amount END AS signed_amount
 FROM events e JOIN users s ON s.id=e.sender_id JOIN users d ON d.id=e.recipient_id),
 filtered AS (SELECT * FROM enriched WHERE ($2::text IS NULL OR type=$2) AND ($3::text IS NULL OR direction=$3)
 AND ($4::text IS NULL OR status=$4) AND (reference ILIKE $5 OR original_reference ILIKE $5 OR sender_name ILIKE $5 OR recipient_name ILIKE $5 OR note ILIKE $5)
 AND ($6::date IS NULL OR created_at >= $6::date) AND ($7::date IS NULL OR created_at < $7::date+interval '1 day')),
 paged AS (SELECT * FROM filtered ORDER BY created_at DESC,history_id DESC LIMIT 20 OFFSET $8)
 SELECT (SELECT count(*)::int FROM filtered) AS total,COALESCE((SELECT jsonb_agg(paged ORDER BY created_at DESC,history_id DESC) FROM paged),'[]') AS items`,
    [
      actor,
      f.type ?? null,
      f.direction ?? null,
      f.status ?? null,
      `%${f.search}%`,
      f.from ?? null,
      f.to ?? null,
      (f.page - 1) * 20,
    ],
  );
  return { ...result.rows[0], page: f.page, pageSize: 20 };
}
reversalRouter.get('/history', async (req, res) =>
  res.json(await history(req.query, res.locals.user.id)),
);
reversalRouter.get('/admin/history', admin, async (req, res) =>
  res.json(await history(req.query, null)),
);
reversalRouter.get('/reversals/:id', async (req, res) => {
  const r = (
    await pool.query(
      `SELECT r.*,j.reference,j.created_at AS posted_at,t.reference AS original_reference,t.amount::text,t.currency,
 t.sender_id AS original_sender_id,t.recipient_id AS original_recipient_id,s.name AS sender_name,d.name AS recipient_name,
 u.name AS reviewer_name,q.id AS request_id
 FROM reversals r JOIN transfers t ON t.id=r.transfer_id JOIN ledger_journals j ON j.id=r.journal_id
 JOIN users s ON s.id=t.recipient_id JOIN users d ON d.id=t.sender_id JOIN users u ON u.id=r.reviewer_id
 LEFT JOIN reversal_requests q ON q.reversal_id=r.id WHERE r.id=$1 AND (t.sender_id=$2 OR t.recipient_id=$2 OR $3::boolean)`,
      [id(req.params.id), res.locals.user.id, res.locals.user.role === 'ADMIN'],
    )
  ).rows[0];
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Reversal not found.');
  const entries = (
    await pool.query(
      'SELECT direction,amount::text,account_id FROM ledger_entries WHERE journal_id=$1',
      [r.journal_id],
    )
  ).rows;
  // The recipient may see the financial reversal, but not the sender's private request notes.
  res.json({
    ...r,
    request_id:
      res.locals.user.role === 'ADMIN' || res.locals.user.id === r.original_sender_id
        ? r.request_id
        : null,
    entries,
  });
});
