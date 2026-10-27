import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Layers3,
} from 'lucide-react';
import { api, money, date, type Transfer, type Topup, type List } from '../lib/api';
import {
  PageHeading,
  ErrorBox,
  Loading,
  Empty,
  TransactionsTable,
  ConfirmDialog,
} from '../components/ui';
type Overview = {
  total: number;
  completed: number;
  held: number;
  failed: number;
  volume: string;
  daily: { day: string; count: number; volume: string }[];
  jobs: { pending: number; delivered: number; attempts: number };
};
export function Overview() {
  const q = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<Overview>('/admin/overview'),
    refetchInterval: 10000,
  });
  const recent = useQuery({
    queryKey: ['admin-transfers'],
    queryFn: () => api<List>('/admin/transfers'),
  });
  const d = q.data;
  return (
    <>
      <PageHeading
        eyebrow="OPERATIONS / SYNTHETIC DATA"
        title="The bigger picture."
        text="Payments, review holds, and the health of the system."
        action={
          <Link className="button" to="/admin/reviews">
            <ShieldCheck size={16} /> Review queue
          </Link>
        }
      />
      <ErrorBox error={q.error || recent.error} />
      <div className="stat-grid">
        {[
          ['Completed volume', d ? money(d.volume) : '…', 'All-time simulated INR'],
          ['Completed payments', d?.completed ?? '…', 'Posted to the ledger'],
          ['Awaiting review', d?.held ?? '…', 'No funds reserved'],
          ['Failed requests', d?.failed ?? '…', 'No partial posting'],
        ].map(([label, value, caption]) => (
          <section className="panel stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{caption}</small>
          </section>
        ))}
      </div>
      <div className="admin-middle">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Payment activity</h2>
              <p>Completed transfers · last seven UTC days</p>
            </div>
            <Activity size={19} />
          </div>
          <div className="chart" role="img" aria-label="Completed transfers per day">
            {d?.daily.map((day) => (
              <div key={day.day}>
                <span>{day.count}</span>
                <div
                  style={{
                    height: `${Math.max(2, (day.count / Math.max(1, ...d.daily.map((v) => v.count))) * 105)}px`,
                  }}
                />
                <small>
                  {new Date(`${day.day}T00:00:00Z`).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  })}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel operations-card">
          <Layers3 size={25} />
          <h3>Behind every payment</h3>
          <p>
            Check accounting invariants and inspect delivery attempts from the transactional event
            outbox.
          </p>
          <div>
            <span>Pending events</span>
            <strong>{d?.jobs.pending ?? '…'}</strong>
          </div>
          <div>
            <span>Delivered events</span>
            <strong>{d?.jobs.delivered ?? '…'}</strong>
          </div>
          <Link className="text-link" to="/admin/integrity">
            Check system integrity <ArrowRight size={14} />
          </Link>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Latest transfers</h2>
          <Link className="text-link" to="/admin/transactions">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        {recent.isPending ? (
          <Loading />
        ) : (
          <TransactionsTable items={recent.data?.items.slice(0, 5) ?? []} admin />
        )}
      </section>
    </>
  );
}
type Review = Transfer & {
  score: number;
  signals: { id: string; description: string; points: number }[];
  rule_version: string;
};
export function Reviews() {
  const client = useQueryClient();
  const [tab, setTab] = useState<'transfers' | 'topups'>('transfers');
  const [selected, setSelected] = useState<{
    id: string;
    decision: 'APPROVE' | 'REJECT';
    type: string;
    amount: string;
  } | null>(null);
  const [rationale, setRationale] = useState('');
  const reviews = useQuery({
    queryKey: ['reviews'],
    queryFn: () => api<Review[]>('/admin/reviews'),
    refetchInterval: 10000,
  });
  const topups = useQuery({
    queryKey: ['admin-topups'],
    queryFn: () => api<Topup[]>('/admin/topups'),
    refetchInterval: 10000,
  });
  const mutation = useMutation({
    mutationFn: () =>
      api(`/admin/${selected!.type}/${selected!.id}`, {
        method: 'POST',
        body: { decision: selected!.decision, rationale },
      }),
    onSuccess: () => {
      setSelected(null);
      setRationale('');
      void client.invalidateQueries();
    },
  });
  function choose(
    item: { id: string; amount: string },
    decision: 'APPROVE' | 'REJECT',
    type: string,
  ) {
    mutation.reset();
    setRationale('');
    setSelected({ ...item, decision, type });
  }
  return (
    <>
      <PageHeading
        eyebrow="HUMAN JUDGMENT MATTERS"
        title="A moment of consideration."
        text="Review the evidence, leave a reason, and make a clear decision."
      />
      <div className="tabs">
        <button className={tab === 'transfers' ? 'active' : ''} onClick={() => setTab('transfers')}>
          Transfer reviews <span>{reviews.data?.length ?? 0}</span>
        </button>
        <button className={tab === 'topups' ? 'active' : ''} onClick={() => setTab('topups')}>
          Funding requests <span>{topups.data?.length ?? 0}</span>
        </button>
      </div>
      <ErrorBox error={reviews.error || topups.error} />
      {(tab === 'transfers' ? reviews.isPending : topups.isPending) ? (
        <Loading />
      ) : tab === 'transfers' ? (
        reviews.data?.length ? (
          <div className="review-grid">
            {reviews.data.map((t) => (
              <section className="panel review-card" key={t.id}>
                <div className="review-top">
                  <span className="status pending_review">Awaiting review</span>
                  <span className="risk-score">{t.score}/100 risk</span>
                </div>
                <h2>{money(t.amount)}</h2>
                <p>
                  {t.sender_name} → {t.recipient_name}
                </p>
                <small className="mono">{t.reference}</small>
                <div className="signals">
                  {t.signals.map((s) => (
                    <div key={s.id}>
                      <AlertTriangle size={14} />
                      <span>{s.description}</span>
                      <strong>+{s.points}</strong>
                    </div>
                  ))}
                </div>
                <small>
                  Rules v{t.rule_version} · {date(t.created_at)}
                </small>
                <div className="review-actions">
                  <button className="button" onClick={() => choose(t, 'APPROVE', 'reviews')}>
                    Approve
                  </button>
                  <button
                    className="secondary danger-text"
                    onClick={() => choose(t, 'REJECT', 'reviews')}
                  >
                    Reject
                  </button>
                  <Link className="text-link" to={`/admin/transactions/${t.id}`}>
                    Details <ArrowRight size={13} />
                  </Link>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section className="panel">
            <Empty
              title="All clear for now"
              text="Transfers held by the risk engine will appear here with their reasons."
            />
          </section>
        )
      ) : topups.data?.length ? (
        <div className="review-grid">
          {topups.data.map((t) => (
            <section className="panel review-card" key={t.id}>
              <span className="status pending_review">Funding request</span>
              <h2>{money(t.amount)}</h2>
              <p>{t.name}</p>
              <small>{date(t.created_at)}</small>
              <div className="review-actions">
                <button className="button" onClick={() => choose(t, 'APPROVE', 'topups')}>
                  Approve funding
                </button>
                <button
                  className="secondary danger-text"
                  onClick={() => choose(t, 'REJECT', 'topups')}
                >
                  Reject
                </button>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty title="No funding requests to review" />
        </section>
      )}
      {selected && (
        <ConfirmDialog onClose={() => setSelected(null)} busy={mutation.isPending}>
          <h2 id="decision-title">
            {selected.decision === 'APPROVE' ? 'Approve' : 'Reject'} {money(selected.amount)}?
          </h2>
          <p>
            {selected.decision === 'APPROVE'
              ? 'Approval rechecks wallet status and available funds before posting.'
              : 'Rejection leaves the ledger unchanged.'}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <label>
              Reason for this decision
              <textarea
                autoFocus
                required
                minLength={5}
                maxLength={500}
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Explain your decision for the audit trail"
              />
            </label>
            <ErrorBox error={mutation.error} />
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setSelected(null)}
                disabled={mutation.isPending}
              >
                Cancel
              </button>
              <button className="button" disabled={mutation.isPending}>
                Confirm {selected.decision.toLowerCase()}
              </button>
            </div>
          </form>
        </ConfirmDialog>
      )}
    </>
  );
}
type AuditRow = {
  id: string;
  action: string;
  actor_name: string | null;
  entity_id: string | null;
  request_id: string;
  created_at: string;
  metadata: Record<string, unknown>;
};
export function Audit() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['audit', search, page],
    queryFn: () =>
      api<AuditRow[]>(`/admin/audit?${new URLSearchParams({ search, page: String(page) })}`),
  });
  return (
    <>
      <PageHeading
        eyebrow="AN APPEND-ONLY RECORD"
        title="Accountability, in writing."
        text="Who did what, when, and why. Administrative actions remain traceable."
      />
      <section className="panel">
        <div className="filters">
          <input
            aria-label="Filter audit action"
            placeholder="Filter action, e.g. REVIEW or TOPUP"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <ErrorBox error={q.error} />
        {q.isPending ? (
          <Loading />
        ) : q.data?.length ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Data table">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Actor</th>
                  <th>Time</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.action.replaceAll('_', ' ')}</strong>
                      <small className="mono block">{a.entity_id ?? 'System'}</small>
                    </td>
                    <td>{a.actor_name ?? 'System'}</td>
                    <td>{date(a.created_at)}</td>
                    <td>
                      <details>
                        <summary>Inspect record</summary>
                        <pre>
                          {JSON.stringify({ requestId: a.request_id, ...a.metadata }, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
        <div className="pagination">
          <span>Page {page}</span>
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
              disabled={(q.data?.length ?? 0) < 30}
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
type Run = {
  id: string;
  created_at: string;
  result: {
    passed: boolean;
    debits: string;
    credits: string;
    unbalancedJournals: string[];
    negativeWallets: string[];
    projection: string;
  };
};
export function Integrity() {
  const client = useQueryClient();
  const q = useQuery({
    queryKey: ['integrity'],
    queryFn: () => api<Run[]>('/admin/reconciliation'),
  });
  const mutation = useMutation({
    mutationFn: () => api('/admin/reconciliation/run', { method: 'POST' }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['integrity'] }),
  });
  const last = q.data?.[0];
  return (
    <>
      <PageHeading
        eyebrow="VERIFY, DON’T ASSUME"
        title="Does everything add up?"
        text="Run a consistent-snapshot check of posted journals and wallet balances."
        action={
          <button
            className="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <Activity size={16} />
            {mutation.isPending ? 'Checking ledger…' : 'Run reconciliation'}
          </button>
        }
      />
      <ErrorBox error={q.error || mutation.error} />
      <section className={`panel integrity-banner ${last?.result.passed ? 'healthy' : ''}`}>
        {last?.result.passed ? <CheckCircle2 size={35} /> : <ShieldCheck size={35} />}
        <div>
          <h2>
            {last
              ? last.result.passed
                ? 'Every entry accounted for.'
                : 'An integrity check needs attention.'
              : 'Ready for a closer look.'}
          </h2>
          <p>
            {last
              ? `Last run ${date(last.created_at)}`
              : 'No reconciliation has run yet. Start one to verify the ledger.'}
          </p>
        </div>
      </section>
      {last && (
        <div className="stat-grid">
          <section className="panel stat">
            <span>Total debits</span>
            <strong>{money(last.result.debits)}</strong>
            <small>Across all posted entries</small>
          </section>
          <section className="panel stat">
            <span>Total credits</span>
            <strong>{money(last.result.credits)}</strong>
            <small>Across all posted entries</small>
          </section>
          <section className="panel stat">
            <span>Unbalanced journals</span>
            <strong>{last.result.unbalancedJournals.length}</strong>
            <small>Expected: zero</small>
          </section>
          <section className="panel stat">
            <span>Negative wallets</span>
            <strong>{last.result.negativeWallets.length}</strong>
            <small>Expected: zero</small>
          </section>
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Verification history</h2>
            <p>
              Balances are calculated from ledger entries; there is no independent balance cache.
            </p>
          </div>
        </div>
        {q.data?.length ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Data table">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Time</th>
                  <th>Result</th>
                  <th>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id.slice(0, 8)}</td>
                    <td>{date(r.created_at)}</td>
                    <td>
                      <span className={`status ${r.result.passed ? 'completed' : 'failed'}`}>
                        {r.result.passed ? 'Passed' : 'Attention needed'}
                      </span>
                    </td>
                    <td>
                      <details>
                        <summary>Details</summary>
                        <pre>{JSON.stringify(r.result, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No checks recorded yet" />
        )}
      </section>
      <EventDeliveries />
    </>
  );
}
export function RiskRules() {
  const q = useQuery({
    queryKey: ['rules'],
    queryFn: () =>
      api<{
        version: string;
        reviewThreshold: number;
        rules: { id: string; description: string; points: number }[];
      }>('/admin/risk-rules'),
  });
  return (
    <>
      <PageHeading
        eyebrow="TRANSPARENCY BY DEFAULT"
        title="No black box here."
        text="Deterministic signals, clear thresholds, and a human in the loop."
      />
      <ErrorBox error={q.error} />
      <section className="panel rules-intro">
        <ShieldCheck size={27} />
        <div>
          <h2>Rule policy v{q.data?.version ?? '…'}</h2>
          <p>
            Scores add together and cap at 100. Scores of {q.data?.reviewThreshold ?? 60} or more
            hold the request for review. This is a rules engine, not a trained fraud model.
          </p>
        </div>
      </section>
      <section className="panel">
        {q.isPending ? (
          <Loading />
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Data table">
            <table>
              <thead>
                <tr>
                  <th>Signal</th>
                  <th>Condition</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.rules.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{r.description}</td>
                    <td>
                      <span className="subtle-badge">+{r.points}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="muted">
        Read-only policy. Threshold changes require a reviewed code change and a rule-version
        update. Synthetic scenarios do not establish real-world fraud accuracy.
      </p>
    </>
  );
}

function EventDeliveries() {
  const query = useQuery({
    queryKey: ['events'],
    queryFn: () =>
      api<
        {
          id: string;
          type: string;
          attempts: number;
          delivered_at: string | null;
          next_attempt_at: string;
          last_error: string | null;
          receipt_count: number;
        }[]
      >('/admin/events'),
    refetchInterval: 5000,
  });
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Local event delivery</h2>
          <p>Latest 30 outbox events · updates every five seconds · ten-attempt retry limit</p>
        </div>
      </div>
      <ErrorBox error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : query.data?.length ? (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Event deliveries">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Delivery</th>
                <th>Attempts</th>
                <th>Receipts</th>
                <th>Last error / next attempt</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((event) => (
                <tr key={event.id}>
                  <td>
                    <strong>{event.type}</strong>
                    <small className="mono block">{event.id.slice(0, 8)}</small>
                  </td>
                  <td>
                    <span
                      className={`status ${event.delivered_at ? 'completed' : event.attempts >= 10 ? 'failed' : 'pending_review'}`}
                    >
                      {event.delivered_at
                        ? 'Delivered'
                        : event.attempts >= 10
                          ? 'Exhausted'
                          : 'Pending'}
                    </span>
                  </td>
                  <td>{event.attempts} / 10</td>
                  <td>{event.receipt_count}</td>
                  <td>
                    {event.last_error ?? '—'}
                    {!event.delivered_at && event.attempts < 10 && (
                      <small className="block">{date(event.next_attempt_at)}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="No events to deliver yet"
          text="Completed transfers, funding approvals and reversals create events atomically."
        />
      )}
    </section>
  );
}
