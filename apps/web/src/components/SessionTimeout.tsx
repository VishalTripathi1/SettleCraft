import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
type Timing = { remainingMs: number; idleTimeoutMs: number };
export function SessionTimeout({ userId }: { userId: string }) {
  const auth = useAuth();
  const expire = useRef(auth.expire);
  expire.current = auth.expire;
  const deadline = useRef<number | null>(null),
    lastPing = useRef(0),
    busy = useRef(false);
  const [remaining, setRemaining] = useState<number | null>(null),
    [error, setError] = useState('');
  const storageKey = `settlecraft-activity-${userId}`;
  function apply(t: Timing) {
    deadline.current = Date.now() + t.remainingMs;
    setRemaining(t.remainingMs);
    localStorage.setItem(storageKey, String(deadline.current));
  }
  const stay = useRef<() => Promise<void>>(async () => {});
  stay.current = async () => {
    if (busy.current) return;
    busy.current = true;
    lastPing.current = Date.now();
    try {
      apply(await api<Timing>('/auth/activity', { method: 'POST' }));
      setError('');
    } catch {
      setError('Could not extend your session. Check your connection.');
    } finally {
      busy.current = false;
    }
  };
  useEffect(() => {
    let mounted = true;
    void api<Timing>('/auth/session')
      .then((t) => {
        if (mounted) {
          deadline.current = Date.now() + t.remainingMs;
          setRemaining(t.remainingMs);
        }
      })
      .catch(() => {});
    const check = () => {
      if (deadline.current === null) return;
      const left = deadline.current - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) {
        deadline.current = null;
        expire.current('You were signed out after being inactive. Please sign in again.');
      }
    };
    const activity = (event: Event) => {
      check();
      if (!event.isTrusted || deadline.current === null) return;
      if (document.visibilityState === 'visible' && Date.now() - lastPing.current >= 30000)
        void stay.current();
    };
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue) {
        const next = Number(event.newValue);
        if (Number.isFinite(next) && next > Date.now())
          deadline.current = Math.max(deadline.current ?? 0, next);
      }
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
    for (const event of events) window.addEventListener(event, activity, { passive: true });
    window.addEventListener('storage', sync);
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, 1000);
    return () => {
      mounted = false;
      clearInterval(timer);
      for (const event of events) window.removeEventListener(event, activity);
      window.removeEventListener('storage', sync);
      document.removeEventListener('visibilitychange', check);
    };
  }, [storageKey]);
  if (remaining === null || remaining > 60000) return null;
  return (
    <aside className="session-warning" role="alert">
      <div>
        <strong>Still there?</strong>
        <p>Signing out in {Math.ceil(remaining / 1000)} seconds due to inactivity.</p>
        {error && <p>{error}</p>}
      </div>
      <button className="button small" onClick={() => void stay.current()}>
        Stay signed in
      </button>
    </aside>
  );
}
