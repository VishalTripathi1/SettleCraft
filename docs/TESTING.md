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

`npm run check` runs **20 unit/component/API tests and 40 database integration tests** as distinct suites, plus ESLint, strict TypeScript, and frontend/API builds. The core acceptance scenarios in the brief are represented; several related assertions intentionally share one integration test.

The full browser suite has 18 cases across desktop Chrome, mobile Chrome and WebKit (54 case/configuration combinations). A subsequent feature rerun covered 4 reversal, OTP, queued refund and inactivity cases in all three browser configurations (12 additional case/configuration runs). Axe scanning is useful evidence, not a complete WCAG conformance claim or manual screen-reader audit.

## Failure evidence

Playwright saves screenshots and traces under ignored `test-results/` on failure. Successful wallet and integrity screenshots are saved under `docs/screenshots/`. These are captures from real test transactions, not generated mockups. The benchmark writes real observed metrics to `docs/benchmark-results.json`.

## Important test boundaries

- The corruption test uses the low-level posting primitive to deliberately create a negative test wallet, proves reconciliation detects it, and restores it with a compensating journal. Production routes cannot invoke that primitive directly.
- Worker crash injection is a service-level test option, never an HTTP control or client parameter.
- Fixtures are not a formal durability/failover or production security audit. JWT expiry is library-enforced; expiry-time travel, sustained brute-force, process-kill PostgreSQL recovery, and distributed multi-host testing remain additional hardening work.
- GitHub Actions configuration is supplied. Local checks were executed; no remote CI run is claimed.

## Interface stress coverage

Browser cases exercise delayed and failed responses, idempotent retries after lost responses, incoming notifications, keyboard navigation, cross-session balance refresh, reduced motion, and narrow/mobile layouts. Regression fixes cover mobile drawer focus, stale outgoing balances, long names, large amounts, missing page landmarks, and authentication throttling during browser runs. The runner starts a fresh API process per browser and feature file; production rate limits remain unchanged. Axe checks cover reported severities on the scanned screens. This is automated evidence, not a full manual accessibility audit.

## Reversal and OTP coverage (2026-10-31)

New database tests cover sender-only eligibility for every transfer state, duplicate submissions, concurrent approvals, approval/rejection races, direct admin reversal races and pending-request resolution, frozen/disabled accounts, insufficient funds, replayed decisions, request privacy, combined history direction/sorting/pagination/search, audit and reconciliation. OTP tests exercise old accounts, real server-side code consumption, wrong-attempt persistence, expiry, resend cooldown, supersession, sender/payment binding, changed balance/risk, missing configuration and provider failures. Mail adapter unit tests mock the HTTP provider and verify the Brevo request contract and error redaction.

The new browser acceptance case performs the complete ₹1,000 request/approval workflow, checks both participants and unchanged pending balances, retries approval, then tests independent direct reversal and rejection. The OTP browser case mocks email/API responses to exercise delivery, wrong-code and success UI; it does not establish actual inbox delivery. Request modal, admin details and OTP screens receive Axe checks. See [implementation and setup notes](REVERSALS_AND_OTP.md).

### Queued refunds and inactivity

Additional tests verify required nonblank explanations, requesting after the recipient spent the original funds, durable queue authorization, reserved partial funding, outgoing-spend protection, oldest-first settlement, frozen-wallet waiting, and concurrent worker safety. Session integration tests prove that polling and refresh rotation preserve the old activity time, expired access/refresh cannot be revived, and explicit activity renews an active session.

The browser suite now starts the real outbox/refund worker. One acceptance case adds partial funds, verifies reservation in the recipient UI, adds the remainder and waits for automatic posting. Another advances the browser clock to check the inactivity warning, renewal and logout, then checks that protected navigation requires login. Each browser/file receives a fresh API process to avoid pooling all simulated users into the same production rate-limit window; production throttles are unchanged.

Verification-expiry regression tests cover abandoned payments without a code, concurrent sweepers, synchronous expiry when resending without a worker, a fresh valid OTP racing expiry, unchanged fresh/completed payments, one audit event, and no funds movement. Latest full verification on November 1: 20 unit/component/API tests and 40 database integration tests, lint, type checking, and production builds passed. The 12-case cross-browser feature rerun also passed.
