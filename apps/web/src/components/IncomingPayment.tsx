import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, money } from '../lib/api';
type Entry = { id: string; direction: string; amount: string; kind: string };

// Establish a fresh baseline per signed-in session; historical credits never trigger a toast.
export function IncomingPayment({ userId }: { userId: string }) {
  const client = useQueryClient();
  const seen = useRef<Set<string> | null>(null);
  const [notice, setNotice] = useState<{ id: string; amount: bigint; count: number } | null>(null);
  const activity = useQuery({
    queryKey: ['incoming-activity', userId],
    queryFn: () => api<Entry[]>('/wallets/me/ledger-activity'),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    if (!activity.data) return;
    const entries = activity.data;
    const fresh = seen.current ? entries.filter((e) => !seen.current!.has(e.id)) : [];
    if (!seen.current) seen.current = new Set();
    for (const entry of entries) seen.current.add(entry.id);
    if (!fresh.length) return;
    const credits = fresh.filter((entry) => entry.direction === 'CREDIT');
    if (credits.length)
      setNotice({
        id: credits[0]!.id,
        amount: credits.reduce((sum, e) => sum + BigInt(e.amount), 0n),
        count: credits.length,
      });
    for (const queryKey of [
      ['wallet'],
      ['ledger'],
      ['transfers'],
      ['transfer'],
      ['reversal-requests'],
      ['reversal-request'],
      ['admin-transfers'],
    ])
      void client.invalidateQueries({ queryKey });
  }, [activity.data, client]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 10000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return (
    <div
      className="payment-notification-region"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {notice && (
        <div className="payment-notification" key={notice.id}>
          <span className="received-icon">
            <ArrowDownLeft size={23} />
          </span>
          <div>
            <strong>
              {notice.count === 1 ? 'Funds received' : `${notice.count} credits received`}
            </strong>
            <p>+{money(notice.amount)} added to your wallet</p>
            <Link to="/app/dashboard" onClick={() => setNotice(null)}>
              View wallet
            </Link>
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss payment notification"
            onClick={() => setNotice(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
