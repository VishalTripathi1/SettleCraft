import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Check, ArrowLeft } from 'lucide-react';
import { amountSchema, parseAmount } from '@settlecraft/shared';
import { api, money, type Transfer } from '../lib/api';
import { PageHeading, ErrorBox } from '../components/ui';
export function Send() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [step, setStep] = useState(1);
  const [recipient, setRecipient] = useState<{ id: string; name: string; email: string } | null>(
    null,
  );
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [attempted, setAttempted] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      api<Transfer>('/transfers', {
        method: 'POST',
        key,
        body: { recipientId: recipient!.id, amount, currency: 'INR', note },
      }),
    onSuccess: (t) => {
      void client.invalidateQueries();
      navigate(`/app/transactions/${t.id}`);
    },
  });
  async function review(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const parsed = amountSchema.safeParse(amount);
      if (!parsed.success)
        throw new Error('Enter a positive amount with at most two decimal places.');
      const form = new FormData(e.currentTarget);
      const r = await api<{ id: string; name: string; email: string }>(
        `/users/lookup?email=${encodeURIComponent(String(form.get('email')))}`,
      );
      setRecipient(r);
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MOVE VIRTUAL MONEY"
        title="A little goes a long way."
        text="Send simulated INR to another SettleCraft wallet."
      />
      <div className="form-layout">
        <section className="panel form-panel">
          <div className="steps">
            <span className={step === 1 ? 'current' : ''}>
              <i>{step > 1 ? <Check size={12} /> : 1}</i> Payment details
            </span>
            <div />
            <span className={step === 2 ? 'current' : ''}>
              <i>2</i> Review & send
            </span>
          </div>
          {step === 1 ? (
            <form onSubmit={review}>
              <h2>Who are you paying?</h2>
              <p className="muted">Look up a recipient by their exact email address.</p>
              <label>
                Recipient email
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="priya@settlecraft.local"
                  defaultValue={recipient?.email}
                />
              </label>
              <label>
                Amount in INR
                <div className="currency-input">
                  <span>₹</span>
                  <input
                    inputMode="decimal"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </label>
              <label>
                Note <span className="optional">optional</span>
                <input
                  maxLength={160}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What’s this for?"
                />
              </label>
              <ErrorBox error={error} />
              <button className="button full" disabled={busy}>
                {busy ? 'Finding recipient…' : 'Review payment'}
                <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            <div>
              <h2>Everything look right?</h2>
              <p className="muted">Check the recipient and amount before confirming.</p>
              <div className="review-amount">{money(parseAmount(amount))}</div>
              <dl className="detail-list">
                <div>
                  <dt>To</dt>
                  <dd>
                    {recipient?.name}
                    <small>{recipient?.email}</small>
                  </dd>
                </div>
                <div>
                  <dt>Note</dt>
                  <dd>{note || 'No note'}</dd>
                </div>
                <div>
                  <dt>Currency</dt>
                  <dd>INR · simulated funds</dd>
                </div>
              </dl>
              <ErrorBox error={mutation.error} />
              {attempted && mutation.isError && (
                <p className="muted">
                  Retrying uses the same request key. Check your history if the response was lost.
                </p>
              )}
              <button
                className="button full"
                disabled={mutation.isPending}
                onClick={() => {
                  setAttempted(true);
                  mutation.mutate();
                }}
              >
                {mutation.isPending
                  ? 'Submitting safely…'
                  : attempted
                    ? 'Retry this payment'
                    : 'Confirm & send'}
                <ArrowRight size={16} />
              </button>
              {!attempted && (
                <button className="back-button" onClick={() => setStep(1)}>
                  <ArrowLeft size={14} /> Edit payment details
                </button>
              )}
            </div>
          )}
        </section>
        <aside className="form-aside">
          <ShieldCheck size={27} />
          <h3>Thoughtful by design.</h3>
          <p>Each transfer is recorded as an equal debit and credit. Both sides move together.</p>
          <hr />
          <h4>Your request, protected</h4>
          <p>Duplicate clicks and safe retries share one durable request key.</p>
          <h4>A moment for review</h4>
          <p>
            Unusual transfers may wait for an administrator. No funds move while a request is held.
          </p>
          <Link className="text-link" to="/app/transactions">
            View your transactions <ArrowRight size={14} />
          </Link>
        </aside>
      </div>
    </>
  );
}
