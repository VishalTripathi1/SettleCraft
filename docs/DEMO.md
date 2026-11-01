# Recruiter demo (2–3 minutes)

Use a freshly initialized demo DB or an explicitly confirmed local reset if you want exact starting balances. Do not reset an environment containing work you want to keep. No real money is involved.

**0:00–0:20 — Product.** Show the landing page and simulation notice. “SettleCraft is a virtual-INR payment platform built to demonstrate transactional correctness and explainable risk.”

**0:20–1:00 — The payment.** Sign in as Rahul. Show ₹2,000, send ₹500 to Priya at `priya@settlecraft.local`, review and confirm. Open details: COMPLETED, equal debit and credit, one journal reference. Return to wallet: ₹1,500. Priya's original ₹1,000 becomes ₹1,500.

**1:00–1:30 — The failure cases.** Show the automated test for twenty concurrent identical keys and the competing-spend test. Optionally issue the same API intent again through Swagger with the same key. Attempt an unfunded transfer: FAILED, no journal. Explain why a disabled submit button is insufficient.

**1:30–2:05 — User-requested correction.** Open Rahul's completed payment and request a reversal. Sign in as admin, open Reversal requests, inspect the request and approve or reject with a rationale. Explain that submission reserves no funds and approval rechecks the recipient's current balance. Show the separate reversal entry in both participants' histories and its audit event. Amount-only ₹10,000 payments now use email verification instead of this manual queue.

**2:05–2:40 — Proof.** Run reconciliation; show equal totals, zero unbalanced journals and zero negative wallets. Show event receipts and the recorded benchmark. State the hardware and short local test limitations.

**2:40–3:00 — Tradeoffs.** Explain PostgreSQL wallet locks, stable idempotency response vs current GET state, ledger-derived balances, and at-least-once event delivery with idempotent processing. Note that ML and production financial integration are not claimed.

## Resume bullets

- Built SettleCraft, a React/TypeScript and Express virtual-payment platform backed by an immutable PostgreSQL double-entry ledger, atomic transfers, and durable request idempotency.
- Demonstrated duplicate protection with 20 concurrent identical intents and overspend prevention under 12 competing transfers; added transactional risk review, full compensating reversals, and reconciliation.
- Implemented rotating JWT sessions, RBAC/ownership checks, an HMAC-signed local webhook simulator, and crash-safe event processing with deduplicated receipts.
- Optional measured result: “In a short local Apple M1 benchmark, processed 100 unique transfer intents plus 30 retry/conflict requests with 0 duplicate journals and 0 imbalances.” Do not present the run as production throughput.

**GitHub description:** Local virtual-INR payments with an immutable PostgreSQL ledger, durable idempotency, explainable risk review, and a React operations console.

**Short project summary:** SettleCraft explores what it takes to make a payment trustworthy: one durable intent, equal accounting entries, atomic state changes, and evidence under failure. It pairs a responsive wallet/admin UI with database-backed concurrency safeguards and reproducible tests. All balances and activity are synthetic.

## Interview questions

**Why not just update two balances?** A ledger preserves the provenance of every movement and supports compensating reversals. Our balances derive from immutable entries, so there is no mutable projection to drift.

**How do you prevent double spending?** Lock both wallet rows in deterministic order, then read fresh ledger sums and post in one transaction. Competing spends serialize on the sender.

**Is it exactly once?** Network delivery isn't. The application ensures at-most-once posting per scoped idempotent intent; outbox delivery can repeat, and receipt processing deduplicates by event ID.

**Why can an approved review fail?** Held requests do not reserve funds. Approval must recheck current status and balance.

**How accurate is the fraud model?** There is no trained model. Versioned deterministic demo rules produce inspectable reasons; real fraud accuracy was not evaluated.

**What would change for production?** Independent security/accounting reviews, limited database roles, stronger operational controls, durable distributed rate limits, backups, monitoring, retention, user lifecycle and regulatory requirements. This project is not approved for real funds.

## New correction and verification demo

Follow [the reversal walkthrough](REVERSALS_AND_OTP.md#demo-walkthrough) for sender request → admin decision → both histories. The ₹10,000 amount-only example now awaits email verification, not human review. Use a real inbox account plus [Brevo setup](REVERSALS_AND_OTP.md#local-setup) for that demo; seeded `.local` addresses cannot receive codes. Other sufficiently high-risk signals still require admin review.

For the queued-refund demonstration, have the recipient spend the payment before the sender requests a reversal. The required explanation still permits submission. Admin approval queues it, sidebar counts update, and the recipient sees incoming funds reserved until enough accumulates for one full refund. Keep `npm run dev` running so its worker can settle the queue. The app logs out after 15 minutes without foreground activity, with a warning during the final minute.
