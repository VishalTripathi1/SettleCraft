import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { User } from '@settlecraft/shared';
import { api, money, date, type Topup } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PageHeading, ErrorBox, Status, Empty } from '../components/ui';
export function Funding() {
  const client = useQueryClient();
  const [amount, setAmount] = useState('1000');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [attempted, setAttempted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const history = useQuery({
    queryKey: ['topups'],
    queryFn: () => api<Topup[]>('/wallets/me/demo-topups'),
  });
  const mutation = useMutation({
    mutationFn: () => api('/wallets/me/demo-topups', { method: 'POST', key, body: { amount } }),
    onSuccess: () => {
      setSubmitted(true);
      void client.invalidateQueries({ queryKey: ['topups'] });
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="MAKE ROOM TO EXPLORE"
        title="A little demo capital."
        text="Request virtual funds. Every approved top-up has a balanced journal."
      />
      <div className="form-layout">
        <section className="panel form-panel">
          {submitted ? (
            <div className="success-state">
              <CheckCircle2 size={38} />
              <h2>Request sent for review.</h2>
              <p>
                An administrator can approve your request in the review queue. Your balance changes
                only after approval.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  setSubmitted(false);
                  setAttempted(false);
                  setKey(crypto.randomUUID());
                  mutation.reset();
                }}
              >
                Make another request
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setAttempted(true);
                mutation.mutate();
              }}
            >
              <h2>Add simulated funds</h2>
              <p className="muted">Up to ₹10,000 per request and ₹20,000 per rolling 24 hours.</p>
              <div className="preset-amounts">
                {['500', '1000', '5000'].map((a) => (
                  <button
                    disabled={attempted}
                    type="button"
                    className={amount === a ? 'selected' : ''}
                    key={a}
                    onClick={() => setAmount(a)}
                  >
                    ₹{Number(a).toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
              <label>
                Amount in INR
                <div className="currency-input">
                  <span>₹</span>
                  <input
                    required
                    readOnly={attempted}
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </label>
              <ErrorBox error={mutation.error} />
              <button className="button full" disabled={mutation.isPending}>
                {mutation.isPending
                  ? 'Submitting…'
                  : attempted
                    ? 'Retry same request'
                    : 'Request demo funds'}
              </button>
              {mutation.isError && (
                <button
                  className="back-button"
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Only start a new request after checking your request history below. Continue?',
                      )
                    ) {
                      setAttempted(false);
                      setKey(crypto.randomUUID());
                      mutation.reset();
                    }
                  }}
                >
                  Start a new request
                </button>
              )}
            </form>
          )}
        </section>
        <aside className="form-aside">
          <ShieldCheck size={27} />
          <h3>Play money. Proper accounting.</h3>
          <p>
            No bank, card, or payment information is required. These funds have no real-world value.
          </p>
          <h4>How approval works</h4>
          <p>
            Sign in as the seeded demo admin, open Review queue, and approve the funding request
            with a reason.
          </p>
          <h4>Where funds come from</h4>
          <p>
            Issuance debits the system offset account and credits your wallet liability. Nothing
            appears from a balance edit.
          </p>
        </aside>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Funding requests</h2>
        </div>
        <ErrorBox error={history.error} />
        {history.data?.length ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Data table">
            <table>
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Review note</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((t) => (
                  <tr key={t.id}>
                    <td>{date(t.created_at)}</td>
                    <td>{money(t.amount)}</td>
                    <td>
                      <Status value={t.status} />
                    </td>
                    <td>{t.rationale || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No funding requests yet" />
        )}
      </section>
    </>
  );
}
export function Settings() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(auth.user?.name ?? '');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function profile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await api<User>('/users/me', { method: 'PATCH', body: { name } });
      auth.update(user);
      setSaved('Profile updated.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function password(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: f.get('currentPassword'), newPassword: f.get('newPassword') },
      });
      await auth.logout();
      navigate('/login');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title="Make yourself at home."
        text="Manage your profile and account security."
      />
      <ErrorBox error={error} />
      {saved && (
        <p role="status" className="success-message">
          {saved}
        </p>
      )}
      <div className="settings-grid">
        <form className="panel form-panel" onSubmit={profile}>
          <h2>Personal details</h2>
          <label>
            Full name
            <input
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Email address
            <input disabled value={auth.user?.email} />
          </label>
          <p className="muted">Email changes are not supported in this demo.</p>
          <button className="button" disabled={busy}>
            Save profile
          </button>
        </form>
        <form className="panel form-panel" onSubmit={password}>
          <h2>Change password</h2>
          <p className="muted">Updating your password signs out all sessions.</p>
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              placeholder="At least 12 characters"
            />
          </label>
          <button className="secondary" disabled={busy}>
            Update password & sign out
          </button>
        </form>
      </div>
    </>
  );
}
