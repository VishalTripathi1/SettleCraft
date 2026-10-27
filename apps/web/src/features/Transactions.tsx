import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Search, ArrowLeft, CheckCircle2, Clock, ArrowRight } from 'lucide-react';
import { api, money, date, type List, type Transfer } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHeading, ErrorBox, Loading, TransactionsTable, Status } from '../components/ui';
export function Transactions({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const result = useQuery({
    queryKey: ['transfers', admin, search, status, page],
    queryFn: () =>
      api<List>(
        `${admin ? '/admin' : ''}/transfers?${new URLSearchParams({ search, page: String(page), ...(status ? { status } : {}) })}`,
      ),
  });
  return (
    <>
      <PageHeading
        eyebrow={admin ? 'OPERATIONS' : 'YOUR PAYMENT HISTORY'}
        title="Every movement, in view."
        text="Search the story behind your simulated payments."
      />
      <section className="panel">
        <div className="filters">
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label="Search transactions"
              placeholder="Search name, reference, or note"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            aria-label="Filter transaction status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {['COMPLETED', 'PENDING_REVIEW', 'FAILED', 'REJECTED'].map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <ErrorBox error={result.error} />
        {result.isPending ? (
          <Loading />
        ) : (
          <TransactionsTable items={result.data?.items ?? []} userId={user?.id} admin={admin} />
        )}
        <div className="pagination">
          <span>
            Page {page} · {result.data?.total ?? 0} matching transactions
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
              disabled={!result.data || page * 20 >= result.data.total}
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
type Detail = Transfer & {
  entries: { direction: string; amount: string; account_id: string }[];
  decisions: { decision: string; rationale: string; created_at: string }[];
  reversals: { id: string; journal_id: string; rationale: string; created_at: string }[];
  risk: {
    score: number;
    rule_version: string;
    signals: { id: string; description: string; points: number }[];
  } | null;
};
export function TransactionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN';
  const client = useQueryClient();
  const [rationale, setRationale] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const result = useQuery({
    queryKey: ['transfer', id],
    queryFn: () => api<Detail>(`/transfers/${id}`),
    refetchInterval: (q) => (q.state.data?.status === 'PENDING_REVIEW' ? 5000 : false),
  });
  const reverse = useMutation({
    mutationFn: () =>
      api(`/admin/transfers/${id}/reverse`, { method: 'POST', key, body: { rationale } }),
    onSuccess: () => {
      setConfirm(false);
      void client.invalidateQueries();
    },
  });
  const t = result.data;
  if (result.isPending) return <Loading />;
  if (!t) return <ErrorBox error={result.error} />;
  return (
    <>
      <Link
        className="text-link back-link"
        to={admin ? '/admin/transactions' : '/app/transactions'}
      >
        <ArrowLeft size={14} /> All transactions
      </Link>
      <PageHeading
        eyebrow={t.reference}
        title="The complete picture."
        text="A traceable record of this payment and its outcome."
        action={<Status value={t.status} />}
      />
      <div className="detail-grid">
        <section className="panel detail-main">
          <div className="transfer-summary">
            <span className="large-status">
              {t.status === 'COMPLETED' ? <CheckCircle2 size={30} /> : <Clock size={30} />}
            </span>
            <h2>{money(t.amount)}</h2>
            <p>
              {t.sender_name} <ArrowRight size={14} /> {t.recipient_name}
            </p>
            {t.reversals.length > 0 && <span className="status rejected">Fully reversed</span>}
          </div>
          {t.failure_reason && <ErrorBox error={t.failure_reason} />}
          <dl className="detail-list">
            <div>
              <dt>Reference</dt>
              <dd className="mono">{t.reference}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{date(t.created_at)}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{date(t.updated_at)}</dd>
            </div>
            <div>
              <dt>Note</dt>
              <dd>{t.note || 'No note'}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>INR · simulated</dd>
            </div>
          </dl>
          <h3>Payment timeline</h3>
          <ol className="timeline">
            <li>
              <strong>Request received</strong>
              <span>{date(t.created_at)}</span>
            </li>
            <li>
              <strong>
                {t.status === 'PENDING_REVIEW'
                  ? 'Awaiting a human review'
                  : t.status.replaceAll('_', ' ').toLowerCase()}
              </strong>
              <span>
                {t.status === 'PENDING_REVIEW'
                  ? 'Funds are not reserved. Balance is rechecked at approval.'
                  : date(t.updated_at)}
              </span>
            </li>
            {t.decisions.map((d) => (
              <li key={d.created_at}>
                <strong>Review: {d.decision.toLowerCase()}</strong>
                <span>{d.rationale}</span>
              </li>
            ))}
            {t.reversals.map((r) => (
              <li key={r.id}>
                <strong>Reversed with a compensating journal</strong>
                <span>
                  {r.rationale} · {date(r.created_at)}
                </span>
                <span className="mono">{r.journal_id}</span>
              </li>
            ))}
          </ol>
        </section>
        <aside>
          <section className="panel detail-side">
            <h3>Ledger proof</h3>
            <p className="muted">
              {t.entries.length
                ? 'Equal entries. One atomic posting.'
                : 'No money has been posted for this request.'}
            </p>
            {t.entries.map((e) => (
              <div className="proof-row" key={e.direction}>
                <span>{e.direction}</span>
                <strong>{money(e.amount)}</strong>
              </div>
            ))}
            {t.journal_id && (
              <div className="journal-id">
                Journal reference<span className="mono">{t.journal_id}</span>
              </div>
            )}
          </section>
          {t.risk && (
            <section className="panel detail-side">
              <h3>Risk assessment · {t.risk.score}/100</h3>
              <p className="muted">Deterministic rules v{t.risk.rule_version}</p>
              {t.risk.signals.length ? (
                t.risk.signals.map((s) => (
                  <p key={s.id} className="risk-signal">
                    {s.description} <strong>+{s.points}</strong>
                  </p>
                ))
              ) : (
                <p className="muted">No rules triggered.</p>
              )}
            </section>
          )}
          {admin && t.status === 'COMPLETED' && !t.reversals.length && (
            <section className="panel detail-side">
              <h3>Correct this payment</h3>
              <p className="muted">
                Full reversal only. The recipient must still have sufficient funds.
              </p>
              {!confirm ? (
                <button className="secondary" onClick={() => setConfirm(true)}>
                  Review reversal
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    reverse.mutate();
                  }}
                >
                  <label>
                    Reason
                    <textarea
                      minLength={5}
                      maxLength={500}
                      required
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                    />
                  </label>
                  <ErrorBox error={reverse.error} />
                  <button className="button" disabled={reverse.isPending}>
                    Confirm full reversal
                  </button>
                  <button type="button" className="back-button" onClick={() => setConfirm(false)}>
                    Cancel
                  </button>
                </form>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
