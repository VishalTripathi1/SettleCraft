import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  ArrowRight,
  ShieldCheck,
  Layers3,
  GitBranch,
  Activity,
  Check,
} from 'lucide-react';
import { PRODUCT_NAME, DEMO_NOTICE } from '@settlecraft/shared';
export function Landing() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/v1/health/ready');
      if (!response.ok) throw new Error('Database unavailable');
      return response.json();
    },
    refetchInterval: 30000,
  });
  return (
    <>
      <header className="landing-nav">
        <Link className="brand" to="/">
          <span className="brand-icon">
            <Layers3 size={21} />
          </span>
          {PRODUCT_NAME}
          <span className="brand-dot">.</span>
        </Link>
        <nav>
          <a href="#principles">How it works</a>
          <a href="#build">The build</a>
          <a className="button small" href="/login">
            Open demo <ArrowUpRight size={15} />
          </a>
        </nav>
      </header>
      <main>
        <section className="hero">
          <div className="eyebrow">
            <span className="pulse" /> ENGINEERED FOR EVERY MOVEMENT
          </div>
          <h1>
            Move money.
            <br />
            <span>Keep the whole story.</span>
          </h1>
          <p>
            A quieter kind of financial infrastructure. Simulated payments, a verifiable ledger, and
            risk decisions you can actually explain.
          </p>
          <div className="hero-actions">
            <a href="/login" className="button">
              Launch demo <ArrowRight size={17} />
            </a>
            <a href="#principles" className="text-link">
              Look under the hood <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="demo-notice">
            <ShieldCheck size={15} />
            {DEMO_NOTICE}
          </div>
          <div className="hero-ledger">
            <div className="ledger-heading">
              <span>
                <span className="pulse" /> THE DOUBLE-ENTRY PRINCIPLE
              </span>
              <span className="badge">Illustrative journal</span>
            </div>
            <div className="ledger-flow">
              <div className="ledger-person">
                <div className="avatar">R</div>
                <div>
                  <small>FROM RAHUL</small>
                  <strong>Debit ₹500.00</strong>
                  <span>Wallet liability decreases</span>
                </div>
              </div>
              <div className="flow-line">
                <span>INR</span>
                <ArrowRight size={20} />
              </div>
              <div className="ledger-person">
                <div className="avatar teal">P</div>
                <div>
                  <small>TO PRIYA</small>
                  <strong>Credit ₹500.00</strong>
                  <span>Wallet liability increases</span>
                </div>
              </div>
            </div>
            <div className="ledger-foot">
              <span>
                <Check size={15} /> Two entries. One atomic movement.
              </span>
              <span>Debits − credits = ₹0.00</span>
            </div>
          </div>
        </section>
        <section className="principles" id="principles">
          <div className="section-heading">
            <span className="eyebrow">TRUST IS IN THE DETAILS</span>
            <h2>Every rupee has a reason.</h2>
          </div>
          <div className="feature-grid">
            {[
              {
                icon: Layers3,
                title: 'A ledger that adds up',
                text: 'Every movement has an equal debit and credit. Posted journals are immutable, with database-enforced balance checks.',
              },
              {
                icon: GitBranch,
                title: 'One intent. One transfer.',
                text: 'Durable idempotency and transactional locks protect payments from duplicate requests and concurrent spending.',
              },
              {
                icon: ShieldCheck,
                title: 'Risk, with a reason',
                text: 'Transparent rules and human review make unusual transfers understandable. No black-box approvals.',
              },
            ].map((f) => (
              <article key={f.title}>
                <f.icon size={23} />
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="build-panel" id="build">
          <div>
            <span className="eyebrow">BUILDING IN THE OPEN</span>
            <h2>Ready to follow the money?</h2>
            <p>
              Open a synthetic wallet, send a payment, and inspect the ledger.
              <br />
              Explore every step, from a request to its accounting proof.
            </p>
          </div>
          <div className="health-card">
            <Activity size={22} />
            <div>
              <strong>
                {health.isPending
                  ? 'Checking services…'
                  : health.isError
                    ? 'Database unavailable'
                    : 'Database connected'}
              </strong>
              <span>Live status from the local API</span>
            </div>
            <button
              className="icon-button"
              aria-label="Refresh service status"
              onClick={() => void health.refetch()}
            >
              <ArrowUpRight size={20} />
            </button>
          </div>
        </section>
      </main>
      <footer>
        <span className="brand">SettleCraft.</span>
        <span>Built to be understood. Designed to be verified.</span>
        <span>Local-first · Simulated INR</span>
      </footer>
    </>
  );
}
