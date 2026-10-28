import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { Brand } from '../components/Brand';
export function Landing() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch('/api/v1/health/ready');
      if (!response.ok) throw new Error('Unavailable');
      return response.json();
    },
    refetchInterval: 30000,
  });
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <nav>
          <a href="#how-it-works">How it works</a>
          <Link to="/login" className="text-link">
            Sign in <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main>
        <section className="landing-hero">
          <div className="landing-intro">
            <span className="eyebrow">
              <span className="pulse" /> A WORKSPACE FOR VIRTUAL PAYMENTS
            </span>
            <h1>
              Payments,
              <br />
              without the
              <br />
              <span>guesswork.</span>
            </h1>
            <p>
              A simple way to send, review, and track virtual INR. Clear balances. Complete
              transaction records.
            </p>
            <div className="hero-actions">
              <Link className="button" to="/login">
                Open your workspace <ArrowUpRight size={18} />
              </Link>
              <Link className="text-link" to="/register">
                Create an account
              </Link>
            </div>
            <small className="landing-disclaimer">Demo / simulated funds — no real money.</small>
          </div>
          <div className="statement-scene">
            <div className="statement">
              <div className="statement-top">
                <span className="statement-symbol">₹</span>
                <span>
                  PAYMENT RECORD
                  <br />
                  <small>Illustrative example</small>
                </span>
              </div>
              <div className="statement-amount">
                ₹500<span>.00</span>
              </div>
              <span className="statement-status">
                <Check size={14} /> Balanced transfer
              </span>
              <dl>
                <div>
                  <dt>From</dt>
                  <dd>Rahul Sharma</dd>
                </div>
                <div>
                  <dt>To</dt>
                  <dd>Priya Mehta</dd>
                </div>
                <div>
                  <dt>Currency</dt>
                  <dd>INR · simulated</dd>
                </div>
              </dl>
              <div className="statement-posting">
                <div>
                  <span>Debit</span>
                  <strong>₹500.00</strong>
                </div>
                <div>
                  <span>Credit</span>
                  <strong>₹500.00</strong>
                </div>
              </div>
              <div className="statement-footer">
                Two entries. One recorded payment.
                <ArrowUpRight size={16} />
              </div>
            </div>
            <span className="scene-caption">A complete record, down to the last paisa.</span>
          </div>
        </section>
        <section className="product-principles" id="how-it-works">
          <div className="principles-title">
            <span className="eyebrow">LESS FRICTION. MORE CLARITY.</span>
            <h2>
              Everything you need.
              <br />
              Nothing in the way.
            </h2>
          </div>
          <div className="principle-list">
            {[
              {
                title: 'Send with a clear next step',
                text: 'Find a recipient, enter an amount, and review before sending. Follow the payment’s status from the same workspace.',
              },
              {
                title: 'Know where every amount comes from',
                text: 'Balances come from posted entries. Open a transaction to see its debit, credit, and complete payment record.',
              },
              {
                title: 'Review exceptions, with context',
                text: 'Unusual requests go to an administrator with the reasons attached. Funds move only after the necessary checks.',
              },
            ].map((item, i) => (
              <article key={item.title}>
                <span className="principle-number">0{i + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-bottom">
          <div>
            <h2>Ready when you are.</h2>
            <p>Try the local demo with a sample account, or create your own.</p>
            <Link className="text-link" to="/login">
              Explore SettleCraft <ArrowRight size={16} />
            </Link>
          </div>
          <div className="service-status">
            <span className={`pulse ${health.isError ? 'offline' : ''}`} />
            <div>
              <strong>
                {health.isPending
                  ? 'Checking connection'
                  : health.isError
                    ? 'Database unavailable'
                    : 'Local services connected'}
              </strong>
              <small>Live API status</small>
            </div>
            <button
              className="icon-button"
              onClick={() => void health.refetch()}
              aria-label="Refresh service status"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </section>
      </main>
      <footer>
        <Brand />
        <span>Virtual payments. Real accounting.</span>
        <span>Local demo · INR</span>
      </footer>
    </div>
  );
}
