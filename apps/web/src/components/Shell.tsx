import { IncomingPayment } from './IncomingPayment';
import { Brand } from './Brand';
import { useState } from 'react';
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
  const isAdmin = location.pathname.startsWith('/admin');
  if (auth.loading) return <Loading />;
  if (!auth.user) return <Navigate to="/login" replace />;
  if (isAdmin && auth.user.role !== 'ADMIN') return <Navigate to="/app/dashboard" replace />;
  const links = isAdmin
    ? ([
        ['/admin/overview', 'Overview', LayoutDashboard],
        ['/admin/transactions', 'Transactions', ArrowLeftRight],
        ['/admin/reviews', 'Review queue', ShieldCheck],
        ['/admin/audit', 'Audit trail', ClipboardList],
        ['/admin/integrity', 'System integrity', Activity],
        ['/admin/risk-rules', 'Risk rules', SlidersHorizontal],
      ] as const)
    : ([
        ['/app/dashboard', 'Overview', LayoutDashboard],
        ['/app/send', 'Send money', ArrowUpRight],
        ['/app/transactions', 'Transactions', ArrowLeftRight],
        ['/app/fund-demo', 'Add demo funds', PlusCircle],
        ['/app/settings', 'Settings', Settings],
      ] as const);
  const title = links.find((l) => location.pathname.startsWith(l[0]))?.[1] ?? 'Transaction details';
  return (
    <div className="app-layout">
      <IncomingPayment key={auth.user.id} userId={auth.user.id} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
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
      <div className="app-content">
        <header className="app-header">
          <button
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
        <div className="app-main">
          <div className="simulation-banner">
            <ShieldCheck size={14} /> Simulated INR wallet. No real money.
            <span>Local environment</span>
          </div>
          <ErrorBox error={error} />
          <div key={location.pathname} className="route-transition">
            <Outlet />
          </div>
        </div>
        <div className="app-footer">
          <span>SettleCraft</span>
          <span>Demo / simulated funds — no real money</span>
        </div>
      </div>
    </div>
  );
}
