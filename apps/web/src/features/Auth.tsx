import { Brand } from '../components/Brand';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, LoaderCircle, ArrowLeftRight } from 'lucide-react';
import type { User } from '@settlecraft/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ErrorBox } from '../components/ui';
export function AuthPage({ register = false }: { register?: boolean }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  if (auth.user)
    return (
      <Navigate to={auth.user.role === 'ADMIN' ? '/admin/overview' : '/app/dashboard'} replace />
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const data = await api<{ user: User; accessToken: string }>(
        register ? '/auth/register' : '/auth/login',
        {
          method: 'POST',
          body: { email, password, ...(register ? { name: form.get('name') } : {}) },
          retryAuth: false,
        },
      );
      auth.accept(data.user, data.accessToken);
      navigate(data.user.role === 'ADMIN' ? '/admin/overview' : '/app/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-scene">
      <header className="auth-header">
        <Brand />
        <Link to="/">
          Back to home <ArrowRight size={14} />
        </Link>
      </header>
      <div className="auth-linework" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <main className="auth-center">
        <div className="auth-card">
          <div className="auth-emblem" aria-hidden="true">
            <ArrowLeftRight size={25} />
          </div>
          <h1>{register ? 'Create your workspace' : 'Welcome back'}</h1>
          <p className="auth-intro">
            {register
              ? 'Your next move starts here.'
              : 'Everything in order. Ready for your next move.'}
          </p>
          <div className="auth-form">
            <form onSubmit={submit} aria-busy={busy}>
              {register && (
                <label>
                  Full name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Your name"
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 12 characters"
                />
              </label>
              <ErrorBox error={error || auth.error} />
              <button className="button full" disabled={busy || auth.loading}>
                {busy
                  ? register
                    ? 'Creating your workspace…'
                    : 'Signing you in…'
                  : register
                    ? 'Create account'
                    : 'Sign in'}
                {busy ? (
                  <LoaderCircle className="motion-spin" size={17} />
                ) : (
                  <ArrowRight size={17} />
                )}
              </button>
            </form>
            <p className="auth-alternate">
              {register ? 'Already have an account?' : 'New to SettleCraft?'}{' '}
              <Link to={register ? '/login' : '/register'}>
                {register ? 'Sign in' : 'Create an account'}
              </Link>
            </p>
            {!register && (
              <div className="demo-logins">
                <strong>Try a demo account</strong>
                <p>Explore the workspace with a sample account.</p>
                <div>
                  {[
                    ['Rahul', 'rahul'],
                    ['Priya', 'priya'],
                    ['Admin', 'admin'],
                  ].map(([label, user]) => (
                    <button
                      key={user}
                      className="secondary small"
                      type="button"
                      onClick={() => {
                        setEmail(`${user}@settlecraft.local`);
                        setPassword('SettleCraft-demo-2026!');
                      }}
                    >
                      {label} <ArrowRight size={12} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="demo-notice">
              <ShieldCheck size={14} />
              Demo / simulated funds — no real money
            </div>
          </div>
        </div>
        <p className="auth-bottom-note">A little clarity for every payment.</p>
      </main>
    </div>
  );
}
