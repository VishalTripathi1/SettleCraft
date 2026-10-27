import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Layers3, ArrowRight, ShieldCheck } from 'lucide-react';
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
    <div className="auth-layout">
      <section className="auth-story">
        <Link to="/" className="brand">
          <span className="brand-icon">
            <Layers3 size={21} />
          </span>
          SettleCraft.
        </Link>
        <div>
          <span className="eyebrow">CLARITY IN EVERY TRANSACTION</span>
          <h1>
            Your money’s story.
            <br />
            Every entry,
            <br />
            <em>accounted for.</em>
          </h1>
          <p>
            Explore virtual payments built on a real double-entry ledger. Simple on the surface.
            Thoughtful underneath.
          </p>
          <div className="auth-guarantee">
            <ShieldCheck size={20} />
            <span>Simulated funds. Real engineering.</span>
          </div>
        </div>
        <small>A local-first financial infrastructure demo.</small>
      </section>
      <main className="auth-form-wrap">
        <div className="auth-form">
          <span className="eyebrow">{register ? 'MAKE YOURSELF AT HOME' : 'WELCOME BACK'}</span>
          <h2>{register ? 'Create your workspace' : 'Good to see you again.'}</h2>
          <p>
            {register
              ? 'Start with an empty virtual INR wallet.'
              : 'Sign in to your SettleCraft workspace.'}
          </p>
          <form onSubmit={submit}>
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
              {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
              <ArrowRight size={17} />
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
              <strong>Take the local demo for a spin</strong>
              <p>
                Choose a synthetic account. Password is prefilled from the documented local demo
                default.
              </p>
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
              <small>If you changed DEMO_PASSWORD, enter your configured password.</small>
            </div>
          )}
          <div className="demo-notice">
            <ShieldCheck size={14} />
            Demo / simulated funds — no real money
          </div>
        </div>
      </main>
    </div>
  );
}
