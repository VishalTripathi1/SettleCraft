import { SessionTimeout } from './SessionTimeout';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { IncomingPayment } from './IncomingPayment';
import { Brand } from './Brand';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Outlet, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowUpRight,
  ArrowLeftRight,
  PlusCircle,
  Settings,
  ShieldCheck,
  ClipboardList,
  Activity,
  SlidersHorizontal,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ErrorBox, Loading } from './ui';
export function Shell() {
  const auth = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 850px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 850px)');
    const update = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const panel = sidebar.current;
    if (!panel) return;
    panel.querySelector<HTMLButtonElement>('.mobile-close')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== 'Tab') return;
      const targets = Array.from(
        panel.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'),
      );
      if (!targets.length) return;
      event.preventDefault();
      const current = targets.indexOf(document.activeElement as HTMLElement);
      const next = (current + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
      targets[next]?.focus();
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      document.body.style.overflow = previousOverflow;
      menuButton.current?.focus();
    };
  }, [open, mobile]);
  const isAdmin = location.pathname.startsWith('/admin');
  const counts = useQuery({
    queryKey: ['request-counts'],
    queryFn: () =>
      api<{
        reversal_pending: number;
        reversal_queued: number;
        transfer_reviews: number;
        funding_requests: number;
      }>('/admin/request-counts'),
    enabled: auth.user?.role === 'ADMIN',
    refetchInterval: 5000,
  });
  if (auth.loading) return <Loading />;
  if (!auth.user) return <Navigate to="/login" replace />;
  if (isAdmin && auth.user.role !== 'ADMIN') return <Navigate to="/app/dashboard" replace />;
  const links = isAdmin
    ? ([
        ['/admin/overview', 'Overview', LayoutDashboard],
        ['/admin/transactions', 'Transactions', ArrowLeftRight],
        ['/admin/reversal-requests', 'Reversal requests', ArrowLeftRight],
        ['/admin/reviews', 'Review queue', ShieldCheck],
        ['/admin/audit', 'Audit trail', ClipboardList],
        ['/admin/integrity', 'System integrity', Activity],
        ['/admin/risk-rules', 'Risk rules', SlidersHorizontal],
      ] as const)
    : ([
        ['/app/dashboard', 'Overview', LayoutDashboard],
        ['/app/send', 'Send money', ArrowUpRight],
        ['/app/transactions', 'Transactions', ArrowLeftRight],
        ['/app/reversal-requests', 'Reversal requests', ClipboardList],
        ['/app/fund-demo', 'Add demo funds', PlusCircle],
        ['/app/settings', 'Settings', Settings],
      ] as const);
  const title = links.find((l) => location.pathname.startsWith(l[0]))?.[1] ?? 'Transaction details';
  return (
    <div className="app-layout">
      <SessionTimeout key={`session-${auth.user.id}`} userId={auth.user.id} />
      <IncomingPayment key={auth.user.id} userId={auth.user.id} />
      <aside
        ref={sidebar}
        id="workspace-navigation"
        className={`sidebar ${open ? 'open' : ''}`}
        inert={mobile && !open}
        aria-hidden={mobile && !open ? true : undefined}
        role={mobile && open ? 'dialog' : undefined}
        aria-label="Workspace navigation"
        aria-modal={mobile && open ? true : undefined}
      >
        <Brand />
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <div className="workspace-label">{isAdmin ? 'Operations' : 'Your workspace'}</div>
        <nav>
          {links.map(([to, label, Icon]) => (
            <NavLink to={to} onClick={() => setOpen(false)} key={to}>
              <Icon size={18} />
              {label}
              {to === '/admin/reversal-requests' && (
                <span
                  className="nav-count"
                  aria-label={`${counts.data?.reversal_pending ?? 0} requests awaiting review, ${counts.data?.reversal_queued ?? 0} queued for funds`}
                >
                  {(counts.data?.reversal_pending ?? 0) + (counts.data?.reversal_queued ?? 0)}
                </span>
              )}
              {to === '/admin/reviews' && (
                <span className="nav-count" aria-label="Pending payment and funding reviews">
                  {(counts.data?.transfer_reviews ?? 0) + (counts.data?.funding_requests ?? 0)}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {auth.user.role === 'ADMIN' && (
            <Link className="workspace-switch" to={isAdmin ? '/app/dashboard' : '/admin/overview'}>
              {isAdmin ? 'Open personal wallet' : 'Open operations'} <ArrowUpRight size={15} />
            </Link>
          )}
          <button
            className="logout"
            onClick={() => void auth.logout().catch((e) => setError(e.message))}
          >
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>
      {open && (
        <button
          className="sidebar-overlay"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="app-content" inert={mobile && open}>
        <header className="app-header">
          <button
            ref={menuButton}
            aria-expanded={open}
            aria-controls="workspace-navigation"
            className="menu-button icon-button"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumbs">
            {isAdmin ? 'Admin' : 'Personal'}
            <ChevronRight size={12} />
            <strong>{title}</strong>
          </div>
          <div className="header-right">
            <span className="environment-tag">
              <i /> Local demo
            </span>
            <Link
              to="/app/settings"
              className="profile-avatar"
              aria-label={`${auth.user.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')} — Account settings`}
            >
              {auth.user.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </Link>
          </div>
        </header>
        <main className="app-main">
          <div className="simulation-banner">
            <ShieldCheck size={14} /> Simulated INR wallet. No real money.
            <span>Local environment</span>
          </div>
          <ErrorBox error={error} />
          <div key={location.pathname} className="route-transition">
            <Outlet />
          </div>
        </main>
        <footer className="app-footer">
          <span>SettleCraft</span>
          <span>Demo / simulated funds — no real money</span>
        </footer>
      </div>
    </div>
  );
}
