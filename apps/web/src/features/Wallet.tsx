import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Plus,
  ArrowRight,
  Wallet,
  ShieldCheck,
  ArrowLeftRight,
  Layers3,
} from 'lucide-react';
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
  return (
    <>
      <PageHeading
        eyebrow="YOUR MONEY, AT A GLANCE"
        title={`Hello, ${user?.name.split(' ')[0]}.`}
        text="A clear view of what’s yours and where it’s going."
        action={
          <Link className="button" to="/app/send">
            <ArrowUpRight size={16} /> Send money
          </Link>
        }
      />
      <ErrorBox error={wallet.error || transfers.error || ledger.error} />
      <div className="dashboard-top">
        <section className="wallet-card">
          <div className="wallet-top">
            <span>
              <Wallet size={17} /> YOUR VIRTUAL WALLET
            </span>
            <Layers3 size={24} />
          </div>
          <div className="wallet-label">Available balance</div>
          <div className="balance">
            {wallet.isPending ? '…' : wallet.data ? money(wallet.data.balance) : 'Unavailable'}
            <span>INR</span>
          </div>
          <div className="wallet-bottom">
            <span>
              <i />
              {wallet.data?.status ?? 'Connecting'}
            </span>
            <Link to="/app/fund-demo">
              <Plus size={14} /> Add demo funds
            </Link>
          </div>
          <div className="wallet-orbit" />
        </section>
        <section className="account-summary">
          <div className="summary-icon">
            <ShieldCheck size={21} />
          </div>
          <h3>One balance. A complete record.</h3>
          <p>
            Your available balance comes directly from immutable ledger entries. Pending transfers
            don’t reserve funds.
          </p>
          <div className="summary-footer">
            <span>
              Wallet currency <strong>Indian Rupee</strong>
            </span>
            <span>
              Environment <strong>Synthetic demo</strong>
            </span>
          </div>
        </section>
      </div>
      <div className="quick-grid">
        <Link to="/app/send">
          <span className="quick-icon">
            <ArrowUpRight size={19} />
          </span>
          <div>
            <strong>Send a payment</strong>
            <small>Move virtual INR with confidence</small>
          </div>
          <ArrowRight size={17} />
        </Link>
        <Link to="/app/transactions">
          <span className="quick-icon teal">
            <ArrowLeftRight size={19} />
          </span>
          <div>
            <strong>Follow the trail</strong>
            <small>Every request, from start to finish</small>
          </div>
          <ArrowRight size={17} />
        </Link>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent transactions</h2>
            <p>The latest activity across your wallet.</p>
          </div>
          <Link className="text-link" to="/app/transactions">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        {transfers.isPending ? (
          <Loading />
        ) : (
          <TransactionsTable items={transfers.data?.items.slice(0, 5) ?? []} userId={user?.id} />
        )}
      </section>
      <section className="panel ledger-panel">
        <div className="panel-heading">
          <div>
            <h2>Ledger activity</h2>
            <p>Your latest 20 posted entries, including demo issuance.</p>
          </div>
          <span className="subtle-badge">
            <Layers3 size={12} /> Ledger-derived
          </span>
        </div>
        {ledger.isPending ? (
          <Loading />
        ) : !ledger.data?.length ? (
          <Empty
            title="An empty ledger, ready to begin"
            text="Request demo funds to create your first balanced journal."
          />
        ) : (
          <div className="ledger-list">
            {ledger.data.map((e) => (
              <div key={e.id}>
                <span className={`transaction-icon ${e.direction === 'CREDIT' ? 'incoming' : ''}`}>
                  <ArrowLeftRight size={16} />
                </span>
                <div>
                  <strong>
                    {e.kind === 'DEMO_ISSUANCE'
                      ? 'Demo funds issued'
                      : e.kind === 'REVERSAL'
                        ? 'Transfer reversed'
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
      </section>
    </>
  );
}
