import '@fontsource-variable/geist';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './lib/auth';
import { ErrorBoundary } from './components/ui';
import { Shell } from './components/Shell';
import { Landing } from './features/Landing';
import { AuthPage } from './features/Auth';
import { Dashboard } from './features/Wallet';
import { Send } from './features/Send';
import { Transactions, TransactionDetail } from './features/Transactions';
import { Funding, Settings } from './features/FundingSettings';
import { Overview, Reviews, Audit, Integrity, RiskRules } from './features/Admin';
import './styles.css';
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10000 }, mutations: { retry: false } },
});
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage register />} />
            <Route element={<Shell />}>
              <Route path="/app/dashboard" element={<Dashboard />} />
              <Route path="/app/send" element={<Send />} />
              <Route path="/app/transactions" element={<Transactions />} />
              <Route path="/app/transactions/:id" element={<TransactionDetail />} />
              <Route path="/app/fund-demo" element={<Funding />} />
              <Route path="/app/settings" element={<Settings />} />
              <Route path="/admin/overview" element={<Overview />} />
              <Route path="/admin/transactions" element={<Transactions admin />} />
              <Route path="/admin/transactions/:id" element={<TransactionDetail />} />
              <Route path="/admin/reviews" element={<Reviews />} />
              <Route path="/admin/audit" element={<Audit />} />
              <Route path="/admin/integrity" element={<Integrity />} />
              <Route path="/admin/risk-rules" element={<RiskRules />} />
            </Route>
            <Route
              path="*"
              element={
                <main className="auth-page">
                  <h1>Page not found.</h1>
                  <p>This route isn’t part of your workspace.</p>
                  <Link className="button" to="/">
                    Back to SettleCraft
                  </Link>
                </main>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>,
);
