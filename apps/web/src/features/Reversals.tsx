import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, RotateCcw, LoaderCircle } from 'lucide-react';
import { api, money, date, type Transfer } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHeading, ErrorBox, Loading, Empty, Status, ConfirmDialog } from '../components/ui';
export const reasons: Record<string, string> = {
  WRONG_RECIPIENT: 'Sent to wrong recipient',
  INCORRECT_AMOUNT: 'Incorrect amount',
  DUPLICATE_PAYMENT: 'Duplicate payment',
  MISTAKE: 'Payment made by mistake',
  OTHER: 'Other',
};
export type ReversalRequest = {
  id: string;
  reference: string;
  original_transfer_id: string;
  transfer_reference: string;
  transfer_created_at: string;
  sender_name: string;
  recipient_name: string;
  amount: string;
  reason: string;
  notes: string;
  status: string;
  created_at: string;
  reviewer_name: string | null;
  reviewed_at: string | null;
  decision_reason: string | null;
  failure_reason: string | null;
  reversal_id: string | null;
  eligible?: boolean;
  queued_at?: string | null;
  transfer_status?: string;
  risk?: { score: number; signals: { description: string }[] };
  reversals?: { id: string; created_at: string }[];
  audits?: { id: string; action: string; created_at: string }[];
};
type Requests = { items: ReversalRequest[]; total: number; page: number };
export function PaymentReversalRequests({
  transfer,
}: {
  transfer: Transfer & { reversal_request_eligible?: boolean };
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('WRONG_RECIPIENT');
  const [notes, setNotes] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const requests = useQuery({
    queryKey: ['reversal-requests', transfer.id],
    queryFn: () => api<Requests>(`/transfers/${transfer.id}/reversal-requests`),
    enabled: user?.id === transfer.sender_id && transfer.status === 'COMPLETED',
    refetchInterval: 5000,
  });
  const submit = useMutation({
    mutationFn: () =>
      api(`/transfers/${transfer.id}/reversal-requests`, {
        method: 'POST',
        key,
        body: { reason, notes },
      }),
    onSuccess: () => {
      setOpen(false);
      setKey(crypto.randomUUID());
      void client.invalidateQueries();
    },
  });
  if (user?.id !== transfer.sender_id || transfer.status !== 'COMPLETED') return null;
  const active = requests.data?.items.some((r) =>
    ['PENDING', 'QUEUED', 'APPROVED'].includes(r.status),
  );
  return (
    <section className="panel detail-side">
      <h2 className="section-title">Reversal requests</h2>
      <ErrorBox error={requests.error} />
      {requests.isPending ? (
        <Loading />
      ) : (
        requests.data?.items.map((r) => (
          <div className="request-summary" key={r.id}>
            <Status value={r.status} />
            <p>{reasons[r.reason]}</p>
            <p className="muted">
              {r.failure_reason ||
                r.decision_reason ||
                'An administrator will review your request.'}
            </p>
            <Link className="text-link" to={`/app/reversal-requests/${r.id}`}>
              View request <ArrowRight size={14} />
            </Link>
          </div>
        ))
      )}
      {!requests.isPending &&
        !requests.isError &&
        !active &&
        transfer.status === 'COMPLETED' &&
        transfer.reversal_request_eligible && (
          <>
            <p className="muted">
              Need to correct this payment? Ask an administrator to review a full reversal.
            </p>
            <button
              className="secondary"
              onClick={() => {
                submit.reset();
                setOpen(true);
              }}
            >
              Request reversal
            </button>
          </>
        )}
      {!active && !requests.isPending && !transfer.reversal_request_eligible && (
        <p className="muted">
          Only completed, unreversed payments between active accounts are eligible for a request.
        </p>
      )}
      {open && (
        <ConfirmDialog busy={submit.isPending} onClose={() => setOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <h2 id="decision-title">Request reversal</h2>
            <p>
              {transfer.reference} · {date(transfer.created_at)}
            </p>
            <p>To {transfer.recipient_name}</p>
            <div className="review-amount">{money(transfer.amount)}</div>
            <label>
              Reversal reason
              <select
                value={reason}
                disabled={submit.isPending}
                onChange={(e) => {
                  setReason(e.target.value);
                  setKey(crypto.randomUUID());
                }}
              >
                {Object.entries(reasons).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Explanation
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={notes}
                disabled={submit.isPending}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setKey(crypto.randomUUID());
                }}
              />
            </label>
            <p className="muted">
              Submitting a reversal request does not guarantee a refund. Your request will be
              reviewed by an administrator.
            </p>
            <ErrorBox error={submit.error} />
            <div className="review-actions">
              <button
                className="secondary"
                type="button"
                disabled={submit.isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="button" disabled={submit.isPending}>
                {submit.isPending ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </form>
        </ConfirmDialog>
      )}
    </section>
  );
}
export function ReversalRequests({ admin = false }: { admin?: boolean }) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const prefix = admin ? '/admin' : '/app';
  const q = useQuery({
    queryKey: ['reversal-requests', admin, page, search, status, from, to],
    queryFn: () =>
      api<Requests>(
        `${admin ? '/admin' : ''}/reversal-requests?${new URLSearchParams({ page: String(page), search, ...(status ? { status } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) })}`,
      ),
    refetchInterval: 5000,
  });
  return (
    <>
      <PageHeading
        title={admin ? 'Reversal requests' : 'My reversal requests'}
        text="Track correction requests and their financial outcomes."
      />
      <section className="panel">
        <div className="filters history-filters">
          <label>
            Search requests
            <input
              value={search}
              placeholder="Reference or name"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {['PENDING', 'QUEUED', 'APPROVED', 'REJECTED', 'FAILED'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            From (UTC)
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            To (UTC)
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <ErrorBox error={q.error} />
        {q.isPending ? (
          <Loading />
        ) : q.data?.items.length ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Reversal requests">
            <table>
              <thead>
                <tr>
                  <th>Request / payment</th>
                  <th>Participants</th>
                  <th>Reason</th>
                  <th>Submitted</th>
                  <th>Status / reviewer</th>
                  <th>Amount</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="mono block">{r.reference}</span>
                      <small>{r.transfer_reference}</small>
                    </td>
                    <td>
                      {r.sender_name} → {r.recipient_name}
                    </td>
                    <td>{reasons[r.reason]}</td>
                    <td>{date(r.created_at)}</td>
                    <td>
                      <Status value={r.status} />
                      <small className="block">{r.reviewer_name}</small>
                    </td>
                    <td>{money(r.amount)}</td>
                    <td>
                      <Link className="text-link" to={`${prefix}/reversal-requests/${r.id}`}>
                        View request
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No reversal requests" text="Submitted requests will appear here." />
        )}
        <div className="pagination">
          <span>
            Page {page} · {q.data?.total ?? 0} requests
          </span>
          <div>
            <button
              className="secondary small"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="secondary small"
              disabled={!q.data || page * 20 >= q.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
export function ReversalRequestDetail({ admin = false }: { admin?: boolean }) {
  const { id } = useParams();
  const client = useQueryClient();
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT' | null>(null),
    [rationale, setRationale] = useState('');
  const prefix = admin ? '/admin' : '/app';
  const q = useQuery({
    queryKey: ['reversal-request', id, admin],
    queryFn: () => api<ReversalRequest>(`${admin ? '/admin' : ''}/reversal-requests/${id}`),
    refetchInterval: 5000,
  });
  const mutation = useMutation({
    mutationFn: () =>
      api<ReversalRequest>(`/admin/reversal-requests/${id}/decision`, {
        method: 'POST',
        body: { decision, rationale },
      }),
    onSuccess: () => {
      setDecision(null);
      void client.invalidateQueries();
    },
  });
  const r = q.data;
  if (q.isPending) return <Loading />;
  if (!r) return <ErrorBox error={q.error} />;
  return (
    <>
      <Link className="text-link" to={`${prefix}/reversal-requests`}>
        <ArrowLeft size={14} /> All reversal requests
      </Link>
      <PageHeading
        title="Reversal request"
        eyebrow={r.reference}
        action={<Status value={r.status} />}
      />
      <div className="detail-grid">
        <section className="panel detail-main">
          <div className="review-amount">{money(r.amount)}</div>
          <p>
            {r.sender_name} → {r.recipient_name}
          </p>
          <Link className="text-link" to={`${prefix}/transactions/${r.original_transfer_id}`}>
            Original payment · {r.transfer_reference}
          </Link>
          <dl className="detail-list">
            <div>
              <dt>Request reference</dt>
              <dd className="mono">{r.reference}</dd>
            </div>

            <div>
              <dt>Reason</dt>
              <dd>{reasons[r.reason]}</dd>
            </div>
            <div>
              <dt>Explanation</dt>
              <dd>{r.notes || 'No additional explanation'}</dd>
            </div>
            <div>
              <dt>Requested</dt>
              <dd>{date(r.created_at)}</dd>
            </div>
            <div>
              <dt>Payment date</dt>
              <dd>{date(r.transfer_created_at)}</dd>
            </div>
            {r.reviewed_at && (
              <>
                <div>
                  <dt>Decision date</dt>
                  <dd>{date(r.reviewed_at)}</dd>
                </div>
                <div>
                  <dt>Reviewer</dt>
                  <dd>{r.reviewer_name}</dd>
                </div>
                <div>
                  <dt>Decision</dt>
                  <dd>{r.decision_reason}</dd>
                </div>
              </>
            )}
          </dl>
          <ErrorBox error={r.failure_reason} />
          {r.status === 'PENDING' && (
            <p className="muted">
              No money has moved for this request. Approval depends on eligibility at the time of
              review.
            </p>
          )}
          {r.status === 'QUEUED' && (
            <div className="queue-notice" role="status">
              <strong>Authorized · waiting for funds</strong>
              <p>
                The recipient does not yet have enough unreserved funds. Available and incoming
                funds are reserved for this refund. The full reversal will post automatically when
                enough is available and both wallets are active.
              </p>
              {r.queued_at && <small>Queued {date(r.queued_at)}</small>}
            </div>
          )}
          {r.reversal_id && (
            <Link className="button" to={`${prefix}/reversals/${r.reversal_id}`}>
              <RotateCcw size={16} /> View completed reversal
            </Link>
          )}
          <h2 className="section-title">Request timeline</h2>
          <ol className="timeline">
            <li>
              <strong>Request submitted</strong>
              <span>{date(r.created_at)}</span>
            </li>
            {r.reviewed_at && (
              <li>
                <strong>{r.status.toLowerCase()}</strong>
                <span>
                  {date(r.reviewed_at)} · {r.decision_reason}
                </span>
              </li>
            )}
          </ol>
        </section>
        {admin && (
          <aside>
            <section className="panel detail-side">
              <h2 className="section-title">Review this request</h2>
              <p>Original payment: {r.transfer_status}</p>
              <p>
                {r.eligible
                  ? 'Currently eligible for a full reversal.'
                  : 'If funds are insufficient, approval queues the refund automatically. Inactive accounts or wallets still prevent reversal.'}
              </p>
              {r.status === 'PENDING' && (
                <div className="review-actions">
                  <button
                    className="button"
                    onClick={() => {
                      setDecision('APPROVE');
                      setRationale('');
                      mutation.reset();
                    }}
                  >
                    Approve reversal
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setDecision('REJECT');
                      setRationale('');
                      mutation.reset();
                    }}
                  >
                    Reject request
                  </button>
                </div>
              )}
            </section>
            {r.risk && (
              <section className="panel detail-side">
                <h2 className="section-title">Original risk · {r.risk.score}/100</h2>
                {r.risk.signals.map((s) => (
                  <p key={s.description}>{s.description}</p>
                ))}
              </section>
            )}
            <section className="panel detail-side">
              <h2 className="section-title">Prior reversals</h2>
              {r.reversals?.length ? (
                r.reversals.map((v) => (
                  <p key={v.id}>
                    <Link to={`${prefix}/reversals/${v.id}`}>{date(v.created_at)}</Link>
                  </p>
                ))
              ) : (
                <p className="muted">No reversal posted.</p>
              )}
            </section>
            <section className="panel detail-side">
              <h2 className="section-title">Audit trail</h2>
              {r.audits?.map((a) => (
                <p key={a.id}>
                  {a.action.replaceAll('_', ' ')}
                  <small className="block">{date(a.created_at)}</small>
                </p>
              ))}
            </section>
          </aside>
        )}
      </div>
      {decision && (
        <ConfirmDialog busy={mutation.isPending} onClose={() => setDecision(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <h2 id="decision-title">
              {decision === 'APPROVE' ? 'Approve reversal' : 'Reject request'}
            </h2>
            <p>
              {r.transfer_reference} · {r.sender_name} → {r.recipient_name}
            </p>
            <h2 className="section-title">{money(r.amount)}</h2>
            <p>
              {decision === 'APPROVE'
                ? 'Approval returns the full amount through a compensating ledger entry. If the recipient has insufficient unreserved funds, the request waits in the refund queue and completes automatically when funds arrive. Funds are reserved for queued refunds.'
                : 'Rejection closes this request without moving money.'}
            </p>
            <label>
              Reason for this decision
              <textarea
                required
                minLength={5}
                maxLength={500}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
              />
            </label>
            <ErrorBox error={mutation.error} />
            <div className="review-actions">
              <button
                type="button"
                className="secondary"
                disabled={mutation.isPending}
                onClick={() => setDecision(null)}
              >
                Cancel
              </button>
              <button className="button" disabled={mutation.isPending}>
                {mutation.isPending
                  ? 'Processing…'
                  : decision === 'APPROVE'
                    ? 'Confirm reversal'
                    : 'Confirm rejection'}
              </button>
            </div>
          </form>
        </ConfirmDialog>
      )}
    </>
  );
}
export function ReversalDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const prefix = user?.role === 'ADMIN' ? '/admin' : '/app';
  const q = useQuery({
    queryKey: ['reversal', id],
    queryFn: () =>
      api<{
        reference: string;
        posted_at: string;
        amount: string;
        sender_name: string;
        recipient_name: string;
        transfer_id: string;
        original_reference: string;
        rationale: string;
        request_id: string | null;
        journal_id: string;
        reviewer_name: string;
        entries: { direction: string; amount: string }[];
      }>(`/reversals/${id}`),
  });
  const r = q.data;
  if (q.isPending) return <Loading />;
  if (!r) return <ErrorBox error={q.error} />;
  return (
    <>
      <PageHeading
        title="Reversal details"
        eyebrow={r.reference}
        text="A separate compensating transaction. The original payment remains in your history."
        action={<Status value="COMPLETED" />}
      />
      <section className="panel detail-main">
        <div className="review-amount">{money(r.amount)}</div>
        <p>
          {r.sender_name} → {r.recipient_name}
        </p>
        <dl className="detail-list">
          <div>
            <dt>Reversal reference</dt>
            <dd className="mono">{r.reference}</dd>
          </div>

          <div>
            <dt>Posted</dt>
            <dd>{date(r.posted_at)}</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{r.rationale}</dd>
          </div>
          <div>
            <dt>Authorized by</dt>
            <dd>{r.reviewer_name}</dd>
          </div>
          <div>
            <dt>Journal</dt>
            <dd className="mono">{r.journal_id}</dd>
          </div>
        </dl>
        <Link className="text-link" to={`${prefix}/transactions/${r.transfer_id}`}>
          Original payment · {r.original_reference}
        </Link>
        {r.request_id && (
          <p>
            <Link className="text-link" to={`${prefix}/reversal-requests/${r.request_id}`}>
              Related reversal request
            </Link>
          </p>
        )}
        <h2 className="section-title">Ledger proof</h2>
        {r.entries.map((e) => (
          <div className="proof-row" key={e.direction}>
            <span>{e.direction}</span>
            <strong>{money(e.amount)}</strong>
          </div>
        ))}
      </section>
    </>
  );
}
export function PaymentVerification({ id }: { id: string }) {
  const client = useQueryClient();
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const send = useMutation({
    mutationFn: () => api(`/transfers/${id}/verification/send`, { method: 'POST' }),
    onSuccess: () => {
      setSent(true);
      setCooldown(60);
    },
  });
  const verify = useMutation({
    mutationFn: () =>
      api(`/transfers/${id}/verification/confirm`, { method: 'POST', body: { code } }),
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
  return (
    <section className="panel detail-side verification-panel">
      <h2 className="section-title">Verify your payment</h2>
      <p className="muted">
        Send a six-digit code to your registered email. The code expires in five minutes. The
        payment expires 15 minutes after creation, even if you request another code. No funds move
        until verification succeeds.
      </p>
      <button
        className="secondary"
        disabled={send.isPending || verify.isPending || cooldown > 0}
        onClick={() => send.mutate()}
      >
        {send.isPending
          ? 'Sending code…'
          : cooldown > 0
            ? `Resend in ${cooldown}s`
            : sent
              ? 'Resend code'
              : 'Send verification code'}
      </button>
      {sent && (
        <p role="status">
          Code sent. Check your inbox and spam folder. Wait 60 seconds before resending.
        </p>
      )}
      <ErrorBox error={send.error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          verify.mutate();
        }}
      >
        <label>
          Email verification code
          <input
            required
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <ErrorBox error={verify.error} />
        <button
          className="button full"
          disabled={verify.isPending || send.isPending || code.length !== 6}
        >
          {verify.isPending ? (
            <>
              <LoaderCircle className="motion-spin" size={16} /> Verifying…
            </>
          ) : (
            'Verify & complete payment'
          )}
        </button>
      </form>
      <p className="muted">
        Unusual activity may still require administrator review. Funds are rechecked before
        completion.
      </p>
    </section>
  );
}
