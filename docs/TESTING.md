# Verification and reproduction

## Commands

```sh
npm run check
npm run test:e2e
npm run format:check
npm run benchmark
```

Use Node 22.12+, PostgreSQL 15+, and a dedicated `TEST_DATABASE_URL` whose database name is **exactly `settlecraft_test`**. Both Vitest and Playwright reject a differently named database. Tests insert unique synthetic fixtures; they never reset the development DB. Run suites sequentially, since the test-only outbox fixtures and reconciliation corruption test deliberately manipulate isolated test state.

Browser tests use installed Google Chrome and Playwright WebKit:

```sh
npx playwright install webkit
# If Chrome is not installed:
npx playwright install chrome
```

The browser runner starts its own API on 4001 and Vite on 5174, migrates/seeds the test DB, and stops those test servers afterwards. Development servers on 4000/5173 can remain running. Chrome mobile tests use a 360 × 800 viewport; WebKit uses a desktop viewport. These are automated browser configurations, not physical-device certification.

## Coverage

| Suite                     | Assertions                                                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared money (11)         | Exact decimal parsing; rejects zero, negative, excess precision, scientific notation, malformed and oversized values                                                                                                                                      |
| Health API (2)            | Liveness, correlation ID, security headers, standard missing-route envelope                                                                                                                                                                               |
| Risk unit (1)             | Deterministic score aggregation, bounded total and explainable signals                                                                                                                                                                                    |
| React components (3)      | Participant-dependent incoming/outgoing signs, honest empty state, exact large-value display                                                                                                                                                              |
| Auth integration (2)      | Registration, unique email, empty wallet, rotation, replay revocation, CSRF, invalid credentials, role injection                                                                                                                                          |
| Ledger integration (2)    | Deferred balance checks, immutable records, no late entry insertion                                                                                                                                                                                       |
| Transfer integration (10) | Canonical example, 20 concurrent duplicates, changed-payload conflict, 12 competing spends, invalid requests, frozen/missing recipients, rollback, review races, fresh funds, reversal, funding caps, RBAC/ownership, reconciliation/corruption detection |
| Webhook integration (3)   | HMAC/timestamp validation, deduplicated receipt, crash after receiver commit, retry/backoff without financial mutation                                                                                                                                    |
| Browser flows             | Register → request funds → admin approves → send → inspect debit/credit → dashboard → profile → reconcile → logout; protected routes and viewport width                                                                                                   |
| Browser accessibility     | Axe scans on landing/login and eight authenticated screens, failing serious/critical violations; native modal focus handling and scrollable-table keyboard access                                                                                         |

`npm run check` runs **17 unit/component/API tests and 17 database integration tests** as distinct suites, plus ESLint, strict TypeScript, and frontend/API builds. The core acceptance scenarios in the brief are represented; several related assertions intentionally share one integration test.

Browser tests cover four cases across Chrome desktop, Chrome mobile and WebKit (12 case/configuration combinations). Actual final outcomes are recorded in [PROGRESS](PROGRESS.md). Axe scanning is useful evidence, not a complete WCAG conformance claim or manual screen-reader audit.

## Failure evidence

Playwright saves screenshots and traces under ignored `test-results/` on failure. Successful wallet and integrity screenshots are saved under `docs/screenshots/`. These are captures from real test transactions, not generated mockups. The benchmark writes real observed metrics to `docs/benchmark-results.json`.

## Important test boundaries

- The corruption test uses the low-level posting primitive to deliberately create a negative test wallet, proves reconciliation detects it, and restores it with a compensating journal. Production routes cannot invoke that primitive directly.
- Worker crash injection is a service-level test option, never an HTTP control or client parameter.
- Fixtures are not a formal durability/failover or production security audit. JWT expiry is library-enforced; expiry-time travel, sustained brute-force, process-kill PostgreSQL recovery, and distributed multi-host testing remain additional hardening work.
- GitHub Actions configuration is supplied. Local checks were executed; no remote CI run is claimed.

## Expanded UI stress audit — 28 October 2026

42 browser cases and 34 non-browser tests pass. Added slow/error-response, lost-response retry, real receiver-notification, keyboard-navigation, cross-session balance-refresh, and extreme-size layout coverage. Fixed mobile focus handling, stale outgoing balances, long-name/large-amount overflow and missing landmarks. Accessibility scans now check all reported Axe severities. The browser runner isolates each browser in a fresh server process to preserve production login throttling. See [UI_STRESS_AUDIT.md](UI_STRESS_AUDIT.md) for findings, evidence and limits.
