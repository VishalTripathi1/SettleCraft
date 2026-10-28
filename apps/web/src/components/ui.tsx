import { Component, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowUpRight, ArrowDownLeft, Inbox } from 'lucide-react';
import { date, money, type Transfer } from '../lib/api';
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      <span>{error instanceof Error ? error.message : String(error)}</span>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div aria-label="Loading" role="status" className="skeleton">
      <div />
      <div />
      <div />
    </div>
  );
}
export function Empty({
  title = 'Nothing here yet',
  text = 'Activity will appear here as you use your demo wallet.',
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={29} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value.toLowerCase()}`}>
      <i />
      {value.replaceAll('_', ' ').toLowerCase()}
    </span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {action}
    </div>
  );
}
export function TransactionsTable({
  items,
  userId,
  admin = false,
}: {
  items: Transfer[];
  userId?: string;
  admin?: boolean;
}) {
  if (!items.length)
    return (
      <Empty
        title="No transactions yet"
        text="Completed payments and requests awaiting review will appear here."
      />
    );
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Transaction table">
      <table className="transactions-table">
        <thead>
          <tr>
            <th>{admin ? 'Transfer' : 'Transaction'}</th>
            <th>Reference</th>
            <th>Date</th>
            <th>Status</th>
            <th className="align-right">Amount</th>
            <th>
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => {
            const outgoing = admin || t.sender_id === userId;
            return (
              <tr key={t.id}>
                <td>
                  <div className="table-person">
                    <span className={`transaction-icon ${outgoing ? '' : 'incoming'}`}>
                      {outgoing ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}
                    </span>
                    <div>
                      <strong>
                        {admin
                          ? `${t.sender_name} → ${t.recipient_name}`
                          : outgoing
                            ? t.recipient_name
                            : t.sender_name}
                      </strong>
                      <small className="transaction-note">
                        {t.note || (outgoing ? 'Wallet transfer' : 'Payment received')}
                      </small>
                      <span className="mobile-transaction-meta">
                        <Status value={t.status} />
                      </span>
                    </div>
                  </div>
                </td>
                <td className="mono">{t.reference}</td>
                <td>{date(t.created_at)}</td>
                <td>
                  <Status value={t.status} />
                </td>
                <td className={`align-right amount ${!outgoing ? 'positive' : ''}`}>
                  {admin ? '' : outgoing ? '−' : '+'}
                  {money(t.amount)}
                </td>
                <td>
                  <Link
                    aria-label={`View ${t.reference}`}
                    className="icon-button"
                    to={`${admin ? '/admin' : '/app'}/transactions/${t.id}`}
                  >
                    <ArrowUpRight size={17} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="auth-page">
        <h1>Something didn’t load.</h1>
        <p>Your committed transactions remain in the ledger.</p>
        <button className="button" onClick={() => window.location.reload()}>
          Reload SettleCraft
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

export function ConfirmDialog({
  children,
  onClose,
  busy = false,
}: {
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="decision-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
