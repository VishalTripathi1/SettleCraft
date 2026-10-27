# Roadmap

## Delivered baseline

Local monorepo, API/database health, append-only balanced ledger, secure auth, exact paise, durable intents, ordered locks, wallet and transfer UI, admin funding/review, versioned risk rules, audit, reversal, reconciliation, transactional outbox, signed local receiver, automated correctness/browser checks, and measured benchmark.

## Advanced next steps

- Limited runtime PostgreSQL role distinct from migration owner.
- Outbox dead-letter inspection/requeue flow, longer-running load tests and multi-process contention experiments.
- Cursor pagination and retention policies for long-lived datasets; richer performance telemetry.
- Partial refunds with cumulative refunded-amount locking and explicit authorization policy.
- Session inventory, account recovery, and concurrent-tab refresh coordination.
- More extensive keyboard/screen-reader/cross-browser and failure-injection coverage.

## Optional

- Offline synthetic-data ML experiment with a held-out evaluation split and honest false-positive analysis.
- Local Ollama phrasing of existing risk facts; never authorize posting.
- Redis/BullMQ only when scheduling requirements justify another dependency.
- Dark theme and richer charts.
- Public deployment only after explicit user authorization and appropriate hardening; no deployment occurred.
