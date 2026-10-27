# SettleCraft build progress

The user approved automatic continuation through tested phases on 27 October 2026.

| Phase | Scope                           | Status / evidence                                                                                                               |
| ----- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Must-have foundations           | Passed lint, typecheck, build, liveness/readiness, exact money and SQL constraint tests                                         |
| 1     | Must-have auth and provisioning | Argon2id, JWT, rotating refresh sessions, origin checks, role guard, balanced seeds; API integration tests pass                 |
| 2     | Must-have ledger / transfers    | Durable idempotency, ordered wallet locks, ownership checks, immutable journals; concurrency, rollback and duplicate tests pass |
| 3     | Must-have user experience       | Connected landing, login/register, wallet, send/review, history/details, funding, settings; browser tests in progress           |
| 4     | Must-have risk / review         | Versioned deterministic signals, no reservation, atomic decisions and fresh balance checks; concurrent approval tests pass      |
| 5     | Must-have operations            | Admin analytics, audit, reconciliation, full reversals; API and invariant tests pass                                            |
| 6     | Advanced events                 | Signed local receiver, transactional outbox, retry/backoff and crash tests in progress                                          |
| 7     | Optional ML / design            | ML deliberately omitted; deterministic engine remains authoritative. Responsive and accessibility verification in progress      |
| 8     | Must-have quality / portfolio   | Documentation, benchmark, browser evidence and final checks in progress                                                         |

No external service accounts, paid dependencies, or deployment. No real-money functionality.
