import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowDownLeft, Plus, ArrowRight, ChevronDown } from 'lucide-react';
import { api, money, date, type List } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHeading, ErrorBox, Loading, TransactionsTable, Empty } from '../components/ui';
export function Dashboard() {
  const { user } = useAuth();
  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api<{ balance: string; status: string; wallet_id: string }>('/wallets/me'),
  });
  const transfers = useQuery({
    queryKey: ['transfers', 'recent'],
    queryFn: () => api<List>('/transfers'),
  });
  const ledger = useQuery({
    queryKey: ['ledger'],
    queryFn: () =>
      api<{ id: string; amount: string; direction: string; kind: string; created_at: string }[]>(
        '/wallets/me/ledger-activity',
      ),
  });
  const incoming = ledger.data
    ?.filter((e) => e.direction === 'CREDIT')
    .reduce((sum, e) => sum + BigInt(e.amount), 0n);
  const outgoing = ledger.data
    ?.filter((e) => e.direction === 'DEBIT')
    .reduce((sum, e) => sum + BigInt(e.amount), 0n);
  return (
    <>
      <PageHeading
        title="Overview"
        text={`Welcome back, ${user?.name.split(' ')[0]}. Here’s your wallet at a glance.`}
      />
      <ErrorBox error={wallet.error || transfers.error || ledger.error} />
      <div className="dashboard-top">
        <section className="wallet-card" aria-label="Wallet balance">
          <div className="wallet-top">
            <span>Available balance</span>
            <span className="currency-badge">INR</span>
          </div>
          <div
            className={`balance motion-enter ${wallet.data && money(wallet.data.balance).length > 13 ? 'balance-long' : ''}`}
            key={wallet.data?.balance}
          >
            {wallet.isPending ? '…' : wallet.data ? money(wallet.data.balance) : 'Unavailable'}
          </div>
          <p className="wallet-caption">Demo funds available to send</p>
          <div className="wallet-actions">
            <Link className="button" to="/app/send">
              Send money <ArrowUpRight size={17} />
            </Link>
            <Link className="secondary" to="/app/fund-demo">
              <Plus size={17} /> Add funds
            </Link>
          </div>
          <div className="wallet-bottom">
            <span>{user?.name}</span>
            <span>
              <i />
              {wallet.data?.status === 'ACTIVE'
                ? 'Wallet active'
                : (wallet.data?.status ?? 'Connecting')}
            </span>
          </div>
        </section>
        <section className="account-summary" aria-label="Recent posted activity">
          <div className="summary-heading">
            <h2>Money in & out</h2>
            <span>Last 20 ledger entries</span>
          </div>
          <div className="activity-metric">
            <span className="transaction-icon incoming">
              <ArrowDownLeft size={18} />
            </span>
            <div>
              <span>Money in</span>
              <strong>{incoming === undefined ? '—' : money(incoming)}</strong>
            </div>
          </div>
          <div className="activity-metric">
            <span className="transaction-icon">
              <ArrowUpRight size={18} />
            </span>
            <div>
              <span>Money out</span>
              <strong>{outgoing === undefined ? '—' : money(outgoing)}</strong>
            </div>
          </div>
          <p>
            Includes posted transfers, funding, and reversals. Pending payments are not included.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent transactions</h2>
            <p>Your latest payments and requests.</p>
          </div>
          <Link className="text-link" to="/app/transactions">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        {transfers.isPending ? (
          <Loading />
        ) : (
          <TransactionsTable items={transfers.data?.items.slice(0, 5) ?? []} userId={user?.id} />
        )}
      </section>
      <details className="panel ledger-panel">
        <summary className="panel-heading">
          <div>
            <h2>Accounting entries</h2>
            <p>See the posted entries behind your balance.</p>
          </div>
          <ChevronDown size={18} />
        </summary>
        {ledger.isPending ? (
          <Loading />
        ) : !ledger.data?.length ? (
          <Empty title="No entries yet" text="Approved demo funding creates your first entries." />
        ) : (
          <div className="ledger-list">
            {ledger.data.map((e) => (
              <div key={e.id}>
                <span className={`transaction-icon ${e.direction === 'CREDIT' ? 'incoming' : ''}`}>
                  {e.direction === 'CREDIT' ? (
                    <ArrowDownLeft size={16} />
                  ) : (
                    <ArrowUpRight size={16} />
                  )}
                </span>
                <div>
                  <strong>
                    {e.kind === 'DEMO_ISSUANCE'
                      ? 'Demo funding'
                      : e.kind === 'REVERSAL'
                        ? 'Transfer reversal'
                        : 'Wallet transfer'}
                  </strong>
                  <small>{date(e.created_at)}</small>
                </div>
                <span className={e.direction === 'CREDIT' ? 'positive' : ''}>
                  {e.direction === 'CREDIT' ? '+' : '−'}
                  {money(e.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </details>
    </>
  );
}
