# LedgerGuard — Complete Master Build Prompt

**For:** Cursor, VS Code AI assistants, ChatGPT/Codex  
**Project:** Financial Infrastructure + Explainable Risk Engine (Project #5 from *7 Projects That Prove You Can Engineer Software*)  
**Audience:** Intermediate developer building a serious SDE / backend / full-stack portfolio project  
**Budget:** ₹0 for local development; optional public deployment only if a genuinely suitable free option is available  
**Working title:** LedgerGuard (replace it throughout if you prefer another name)

## How to use this file

1. Create or open an **empty project directory** in Cursor or VS Code. In ChatGPT/Codex, open the same repository/workspace.
2. Copy everything from **BEGIN MASTER PROMPT** through **END MASTER PROMPT** into the coding assistant.
3. Ask it to start with **Phase 0**, show its plan, and then implement **one phase at a time**. A project this large should not be generated as one untested code dump.
4. At the end of each phase, run the tests, review the actual UI and code, commit the work, then say: **“Continue to the next phase, following the master prompt and updating the progress checklist.”**
5. Do not blindly trust “done.” Demand running code, migrations, evidence from tests, and an end-to-end demo.

### Name alternatives

| Name | Positioning |
|---|---|
| **LedgerGuard** | Reliable ledger and fraud safeguards; clear and descriptive |
| **LedgerForge** | Engineering-first; my favorite alternative for a portfolio |
| **TrustLedger** | Financial correctness and auditability |
| **FlowLedger** | Smooth transfer experience plus accounting |
| **RiskLedger** | Emphasizes ledger integrity and anomaly detection |
| **ClearSettle** | Reconciliation and transparent transaction settlement |
| **VaultFlow** | Modern consumer-facing fintech personality |
| **FinSentinel** | Risk monitoring and financial operations |
| **BalanceCore** | Backend system design and account correctness |
| **SettleWise** | Operations, reconciliation, and risk reasoning |

These are creative naming ideas, **not** claims that a domain, company name, or trademark is available. Verify availability before public branding.

---

# BEGIN MASTER PROMPT

You are a senior full-stack software engineer, payment-systems architect, PostgreSQL specialist, security-minded reviewer, QA engineer, and technical mentor. Work collaboratively with me inside this repository and **actually implement** a complete, polished, technically rigorous portfolio project. Do not stop after giving advice, static mockups, pseudo-code, or architecture diagrams.

## 0. Project identity and non-negotiable boundaries

- **Name:** LedgerGuard (keep the name configurable for easy renaming).
- **Tagline:** A reliable virtual-payment platform with a double-entry ledger and explainable fraud-risk monitoring.
- **Product type:** Responsive **full-stack web application**, not native Android/iOS apps.
- **Users:** Regular users with virtual INR wallets; administrators/reviewers monitoring transfers and risk.
- **Core purpose:** Demonstrate SDE-level correctness, transactional database design, API reliability, concurrency handling, full-stack product quality, fraud-risk explanation, testing, and operational observability.
- **Development environment:** Local machine, locally hosted frontend/API/database, ₹0 mandatory paid services.
- **Financial scope:** **Only simulated INR money.** No real deposits, UPI, bank accounts, real-card processing, KYC, merchant integrations, real payouts, or regulated financial claims. Display “Demo / simulated funds — no real money” clearly in the UI.
- **Project character:** Production-inspired *engineering practices*, but explicitly **not certified or safe for handling real funds**. Do not label it production-ready for real payments.
- **AI constraint:** Core accounting must work **without** an LLM or remote AI API. Implement transparent deterministic risk rules first. Optional local Python ML and/or local Ollama explanations later; never let a generative model mutate balances or independently authorize movement of funds.
- **Budget constraint:** No paid hosting, paid maps, paid authentication service, paid fraud data, paid email/SMS, paid API keys, or hidden paid dependencies. Prefer locally runnable open-source components. Never sign me up for a service or deploy without approval.
- **Development style:** Incremental, maintainable, documented, tested. Avoid overengineering early phases; preserve clear module boundaries for advanced features.

## 1. Expected deliverables

Build a running monorepo with:

1. A beautifully designed, responsive public landing page with a “Launch demo” CTA and clear simulated-money notice.
2. Authentication and role-based user/admin access.
3. A user wallet experience: dashboard, simulated funding, send money, transactions, details, and account/settings.
4. An admin experience: overview, transactions, flagged-risk review queue, decisions, audit trail, and system integrity dashboard.
5. A clean Node.js/Express TypeScript REST API with runtime input validation, standardized errors, OpenAPI docs, security controls, and versioning.
6. A PostgreSQL-based append-only double-entry general ledger, **atomic** transfer processing, balance projection/reconciliation, and safe failure recovery.
7. Reliable idempotent transfer/refund endpoints, clear transfer state transitions, locking/concurrency protection, and negative-balance prevention.
8. A deterministic explainable risk engine with review holds; later an optional offline anomaly-detection experiment.
9. Admin-approved virtual top-ups, reversals/refunds, and a documented event/outbox/webhook simulation in advanced phases.
10. Automated unit, integration, API, invariant, security, concurrency, end-to-end, and load tests.
11. Seed/demo data, a resettable local environment, local Docker Compose option, a CI workflow, README, architecture diagrams, API docs, and honest benchmark report.
12. A 2–3 minute recruiter demo script and resume/project-description suggestions with placeholders for **measured** results.

**Definition of done:** A fresh developer can clone the project, follow the README, run migrations and seed, launch the app locally, perform a real simulated transfer, observe it in the ledger and dashboards, reproduce duplicate-request protection, run tests, and inspect actual results. Every menu item, button, form, loading state, and error state shown in the delivered UI must have defined behavior. No decorative fake buttons or mock APIs in the completed app.

## 2. Technology stack

Preserve the presentation's conceptual stack and implement it with these concrete developer-friendly choices:

| Layer | Required choice | Notes |
|---|---|---|
| Language | **TypeScript** across frontend, backend, and shared models | Strict mode; no casual `any` |
| Frontend | **React + Vite + React Router** | Responsive SPA; no SSR dependency |
| Styling | **Tailwind CSS** plus accessible UI primitives | Custom, coherent design system |
| Data fetching | **TanStack Query** | Retry carefully; no accidental financial POST retries |
| Validation | **Zod** shared schemas where appropriate | Runtime server validation always |
| Backend | **Node.js LTS + Express** | Route/controller/service/repository separation |
| Database | **PostgreSQL** | Authoritative ledger and transactional integrity |
| Database access | **Drizzle ORM + SQL migrations**, or equivalent well-justified typed SQL tooling | Use explicit SQL when transactional locks/constraints demand it |
| Authentication | Short-lived access JWT plus rotating HttpOnly refresh cookie, with hashed refresh tokens in DB | Implement CSRF protections for cookie-authenticated writes where applicable; same-origin/proxy dev setup |
| Passwords | Argon2id preferred, bcrypt if well-justified | No plaintext passwords |
| API docs | OpenAPI/Swagger | Keep spec synchronized with implementation |
| Testing | Vitest, Supertest, React Testing Library, Playwright | Separate unit/integration/e2e suites |
| Logging | Structured logger, request IDs | Do not log tokens, secrets, or raw passwords |
| Local orchestration | npm workspaces; optional Docker Compose | Avoid mandatory cloud dependencies |
| Advanced jobs | Redis + BullMQ *only when needed* | Both locally runnable; core transfers must not require a queue |
| Risk detection | Deterministic TypeScript rules first | Optional Python/scikit-learn offline model later |
| Charts | Accessible React-compatible chart library | Prefer readable dashboards over decoration |
| Source control | Git/GitHub; optional CI using available free allowances | No paid CI requirement |

Choose stable, mutually compatible versions available in the current environment; confirm official install requirements instead of assuming exact versions. Keep dependency count conservative. Never expose database credentials in the browser. Do not use MongoDB for this monetary ledger; PostgreSQL is preferable for its transactional semantics.

The source presentation additionally mentions **Redis, queues, webhooks, Python/ML, and an LLM explanation layer**. Treat those as advanced or optional modules, not prerequisites for an initial runnable system. Express, Vite, Tailwind, authentication choices, test tooling, and Drizzle are **implementation details added for this project**, not literal requirements from the original presentation.

## 3. Repository architecture

Use a clear monorepo, approximately:

```text
ledgerguard/
  apps/
    web/
      src/
        app/                  # providers, router, routes, app shell
        components/           # reusable accessible UI components
        features/auth/
        features/wallet/
        features/transfers/
        features/transactions/
        features/admin/
        features/risk/
        lib/                  # API client, formatters, configuration
        styles/
      public/
      tests/
    api/
      src/
        config/
        middleware/
        modules/
          auth/
          users/
          wallets/
          ledger/
          transfers/
          refunds/
          risk/
          admin/
          audit/
          reconciliation/
          webhooks/
        db/schema/
        db/migrations/
        db/seed/
        workers/
        errors/
        utils/
        app.ts
        server.ts
      tests/unit/
      tests/integration/
      tests/concurrency/
  packages/
    shared/                   # types, Zod contracts, enums
  scripts/                    # local validation, demo setup, load tests
  docs/
    ARCHITECTURE.md
    DATA_MODEL.md
    SECURITY.md
    API.md
    TESTING.md
    BENCHMARKS.md
    DEMO.md
    DECISIONS.md
    ROADMAP.md
    PROGRESS.md
  .env.example
  docker-compose.yml         # optional app services, local Postgres/Redis
  README.md
  package.json
```

Adapt the exact tree if the tooling demands it, but preserve domain boundaries and separation of responsibilities. Use centralized configuration validation and clear npm scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `db:migrate`, `db:seed`, `db:reset-demo`, and `check`.

## 4. UI and visual direction

Build a polished **modern fintech SaaS** design that looks credible in an SDE portfolio. Use a light theme by default: off-white surfaces, deep navy/charcoal text, cool indigo/blue primary actions, teal/success accents, restrained amber/red risk alerts, generous spacing, crisp data tables, rounded cards, and restrained shadows. Avoid copying a real bank or fintech brand, oversized gradients, or generic AI imagery. A dark mode may be added if time permits.

### Global UI requirements

- Responsive at approximately 360px mobile, tablet, and desktop widths.
- Semantic HTML, keyboard navigation, visible focus, sufficient contrast, descriptive labels, and screen-reader-friendly validation/error text.
- Proper loading skeletons, empty states, network-error and permission-error states, success feedback, error boundaries, and safe confirmation dialogs.
- Currency formatted with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` for display; never use floating-point amounts for business logic.
- Friendly dates in the user's chosen time zone; store UTC timestamps.
- Shared sidebar/topbar, breadcrumbs or headings, profile menu, toast notifications, status badges, filters, pagination, and searchable transaction tables.
- Clear “Demo funds / not real money” notice on wallet and transfer screens.
- Every screen must operate against actual API endpoints, not hardcoded mock objects, except explicit empty/skeleton/demo seed states.

### Routes and screens

**Public**
- `/`: attractive landing page, product explanation, feature highlights, architecture/tech preview, “Open demo,” no fake marketing statistics.
- `/login`, `/register`: validated forms, accessible errors, password rules, login/logout, no fake OAuth options.
- `/forgot-password`: optional local demo reset workflow; do not imply real email delivery if none exists.

**Authenticated user**
- `/app/dashboard`: wallet balance, available amount, recent activity, send/fund CTA, status summaries.
- `/app/send`: recipient lookup, amount, optional note, review/confirm step, pending/complete/failed response, disable double-clicks **and** backend idempotency; unique key per intended operation.
- `/app/transactions`: history, search/filter/sort, pagination, transaction statuses.
- `/app/transactions/:id`: transfer reference, participants (respect privacy), amount, state timeline, risk/review status if relevant, timestamp, ledger/reference links where authorized.
- `/app/fund-demo`: add configured virtual demo funds via an auditable issuance/top-up flow with rate/amount limits; never mint balances by direct SQL update.
- `/app/settings`: user profile, change password, logout, sessions if implemented.

**Admin (RBAC protected on server and client)**
- `/admin/overview`: simulated transfer volume, completed/held/failed counts, recent trends, no invented production KPIs.
- `/admin/transactions`: all transactions, filters, details, status, IDs, actor and risk information.
- `/admin/reviews`: PENDING_REVIEW queue, risk signals, reason explanations, approve/reject with confirmation, audit record.
- `/admin/audit`: append-only admin/action events, event types, actor, target, timestamps, filters.
- `/admin/integrity`: ledger debits/credits totals, last reconciliation results, mismatches, balances check, background job status where available.
- `/admin/risk-rules`: read rules and thresholds; editing only if implemented with validation and audit trail.

Do not expose an admin-register checkbox. Create admin accounts only through a controlled local seed or admin bootstrap command with credentials documented as demo-only and changeable via environment variables.

## 5. Domain model and database requirements

Implement thoughtful migrations, foreign keys, useful indexes, not-null constraints, uniqueness constraints, check constraints, timestamps, and enums/checks as appropriate. At minimum support:

1. `users`: UUID, name, unique normalized email, password hash, role, status, created/updated timestamps.
2. `refresh_sessions`: user, hashed refresh token identifier/token digest, expiry, revoked/rotated metadata, device/user-agent metadata if safely captured.
3. `wallets`: UUID, owner, currency `INR`, active/frozen status, created time, optional transactionally maintained cached balance in **minor units**.
4. `ledger_accounts`: UUID, account category (user wallet liability, system issuance/offset, etc.), optional wallet relation, currency, lifecycle status. Document accounting sign conventions precisely.
5. `ledger_journals`: UUID, kind (`DEMO_ISSUANCE`, `TRANSFER`, `REVERSAL`, etc.), reference, posting time, immutable metadata, link to business transaction.
6. `ledger_entries`: UUID, journal ID, account ID, debit/credit direction, positive BIGINT amount in paise, currency, created timestamp. **Never UPDATE/DELETE posted entries.**
7. `transfer_requests` / `transfers`: UUID, sender/recipient, amount in paise, currency, public reference, status, notes, risk score/result, created/updated timestamps, posted journal ID when completed.
8. `idempotency_records`: user/scope + idempotency key unique, request payload fingerprint, operation reference, stable result/response data, timestamps/expiry policy.
9. `risk_assessments` and `risk_signals`: transaction, score, reasons, rule/version, decision, evaluated time.
10. `review_decisions`: transfer, reviewer, approve/reject, sanitized rationale, timestamp; prevent multiple effective decisions.
11. `audit_events`: append-only actor/action/entity/outcome/correlation ID/safe metadata/timestamp.
12. `refunds_or_reversals`: references to original completed transaction/journal; compensating journal and lifecycle; no mutation of the original posting.
13. `outbox_events`, `webhook_deliveries`, `reconciliation_runs`, optional `system_jobs` for advanced phases.

### Money and accounting invariants

- Store **integer paise**, not JavaScript floating-point currency. Parse decimal inputs safely; reject fractions of a paisa, invalid formatting, negatives, zero transfers, overflow, unsupported currency, or unsafe integer conversions.
- Use PostgreSQL `BIGINT` or numeric integer handling with explicit safe serialization to JSON (e.g. string) to avoid JS precision loss; never silently coerce unsafe values to `number`.
- For each **posted journal**, sum(debits) **must equal** sum(credits) for the same currency. Enforce by correct service design and strong database-backed verification (prefer a deferred constraint trigger or equivalent PostgreSQL posting procedure for multi-row enforcement); a simple per-row CHECK cannot enforce cross-row totals.
- There must be no user-wallet balance change without journal entries. If maintaining a cached balance, update it **in the same transaction** as journal posting and provide a reconciliation routine to compare it with ledger-derived values.
- Define the liability/accounting direction: transfers reduce sender wallet liability via **debit**, increase receiver wallet liability via **credit**, with equal amounts. Show equivalent user-facing `-₹X/+₹X` in the UI. If choosing another sign convention, document it unambiguously and test it.
- Demo issuance/top-ups must have a balancing **system offset account** and be traceable; never initialize balances by magic direct mutation.
- Prevent user balances from becoming negative under simultaneous requests. Use PostgreSQL transactions plus appropriate row-level locks, deterministic lock ordering, or conditional updates; demonstrate which race conditions are prevented.
- Failed/denied/pending-review requests must not create posted money movements.
- Reversals/refunds create **new compensating journals**, not deletions or edits of old entries. Prevent over-refunding, repeated refund posts, and unintended self-refunds.
- Use database constraints and transaction boundaries; do not depend only on frontend button disabling, optimistic UI, or in-memory server locks.

## 6. Transfer state machine and flows

Define and implement an explicit state model such as:

- `CREATED` → risk assessment
- `CREATED` → `PENDING_REVIEW` for high risk; **no ledger posting yet**
- `CREATED` → `PROCESSING` → `COMPLETED` for allowed transfers
- `PENDING_REVIEW` → `PROCESSING` → `COMPLETED` after approved review and fresh balance/status checks
- `PENDING_REVIEW` → `REJECTED` after reviewer rejection
- Operational errors may lead to `FAILED` if no posting occurred, with precise terminal state semantics

Prohibit invalid transitions. State changes and associated posting/decision records must be transactional and concurrency-safe. If a reviewer approves a held transfer but the sender no longer has sufficient funds, do **not** post it: return an honest failure status with explanation. Define whether pending transfers reserve funds (recommended MVP: **no reservation**, and recheck balance on approval); prominently document this behavior.

### Transfer request example

Rahul has ₹2,000. Priya has ₹1,000. Rahul requests ₹500:
1. Frontend generates one UUID idempotency key tied to this user intent.
2. Server authenticates, validates, checks recipient and amount, enforces rate limits, rejects self-transfer.
3. If the **same key + same payload** was already processed, return the same stable result and **do not post again**.
4. If the **same key + different payload** is seen, return `409 Conflict`; do not reinterpret it as a new transfer.
5. Evaluate risk. For safe requests, start a PostgreSQL transaction, lock affected wallet/account rows in deterministic order, revalidate balances/status, insert transfer journal and balanced entries, update projections, append audit/outbox, commit.
6. User balances become ₹1,500 and ₹1,500. Both changes appear together or neither occurs.
7. Lost-response retry returns the original result. A duplicated click, repeated HTTP request, parallel request, or backend restart must not create duplicate movement.

Implement robust persistence of idempotency state, operation fingerprint, in-progress/concurrent duplicate handling, and stable outcome recovery. Document the expected behavior for requests that time out *before* server commit and *after* server commit. Make retries safely recoverable. Avoid assuming exactly-once delivery on networks; achieve **at-most-once financial posting per idempotent intent** using database constraints and transactional logic.

## 7. Risk engine (honest, explainable, locally runnable)

**Initial implementation: deterministic rules**, not pretend AI. Give each transfer a risk score (0–100), explainable rule hits, risk level (`LOW`, `MEDIUM`, `HIGH`), rule version, and a clear action (`ALLOW`, `REVIEW`, `REJECT` if explicitly supported). Make score aggregation documented and deterministic, and differentiate *risk scoring* from *ledger posting*.

Candidate configurable demo rules:
- Transaction exceeds a documented demo amount threshold.
- Sender initiates an unusual number of requests/transfers in a sliding time window.
- Aggregate recent value exceeds a threshold.
- Newly created account performs unusually large activity.
- Repeated failed transfer attempts.
- Optional inconsistent simulated device/IP pattern, **only if genuine test data exists**; don't fabricate device intelligence.

Store triggered reasons, timestamps, and rule version. Expose risk details to admins; provide only suitable user-facing pending/rejected explanations. Support safe local synthetic examples: ordinary payment, rapid small payments, oversized amount, burst of failures. Do not label the rules as trained machine-learning predictions.

**Optional advanced ML:** Create an offline Python/scikit-learn anomaly-detection experiment using synthetic transaction data and an explicitly defined evaluation split. Track false positives/negatives where labels make sense, precision/recall and threshold selection; explain the limits of synthetic data. Keep the deterministic rules as safe fallback. A local Ollama model may help phrase admin-facing risk explanations, but its outputs must be non-authoritative, bounded to provided signals, and never accepted as ledger commands, account balances, or approval decisions. No paid API keys.

## 8. API contract

Design versioned JSON REST endpoints under `/api/v1`, with request/response types, validation, proper HTTP status codes, rate limits, authentication and RBAC. Suggested endpoints:

**System**
- `GET /health/live`, `GET /health/ready` (readiness checks DB), no secret leakage.

**Auth and profile**
- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `PATCH /users/me`, `POST /auth/change-password`.

**Wallets and transfers**
- `GET /wallets/me`, `POST /wallets/me/demo-topups`, `POST /transfers`, `GET /transfers`, `GET /transfers/:id`, `GET /wallets/me/ledger-activity`.
- `POST /transfers` requires an `Idempotency-Key` and schema such as `{recipientId, amount:"500.00", currency:"INR", note?:string}`; distinguish client display amount from minor-unit ledger storage.
- `POST /transfers/:id/reversal-request` or a dedicated authenticated, authorized refund API if implemented. Define who may request/approve it and limitations.

**Admin**
- `GET /admin/overview`, `GET /admin/transfers`, `GET /admin/transfers/:id`, `GET /admin/reviews`, `POST /admin/reviews/:id/approve`, `POST /admin/reviews/:id/reject`, `GET /admin/audit`, `GET /admin/reconciliation`, `POST /admin/reconciliation/run` (protected and rate-limited), `GET /admin/risk-rules`.

**Advanced local provider simulation**
- `POST /webhooks/demo-provider` with HMAC signature, timestamp tolerance and replay protection, backed by a local simulator; never expose it as a real banking integration.

Requirements:
- OpenAPI document plus a convenient Swagger UI route in development.
- Pagination for list endpoints, deterministic ordering, safe filtering and database indexes.
- Consistent `{code, message, details?, requestId}` error representation with no stack traces exposed to browser clients.
- Authorization must check ownership of wallets/transfers, not merely presence of a JWT.
- Return 400/422 for validation, 401 for unauthenticated, 403 for forbidden, 404 for inaccessible records where appropriate, 409 for idempotency conflicts, and actionable server errors.
- Correct request timeouts and aborted requests; financial results remain durable after commit.
- No internal ledger account manipulation endpoints available to normal users.

## 9. Authentication, security, and privacy

- Robust password hashing, login rate limits, secure token generation, short-lived access JWT, hashed and rotated refresh tokens, logout/session revocation, expiry enforcement, and safe handling of cookie security attributes for local vs deployed environments.
- Prefer access tokens kept in memory rather than localStorage. Use HttpOnly refresh cookies; analyze and implement CSRF mitigations for authenticated cookie-based requests. Configure strict CORS and development proxy deliberately. No permissive production wildcards.
- Validate all input on the server, limit body size, use security headers (e.g. Helmet), escape/sanitize presentation outputs, parameterized DB queries, prevent mass assignment, and avoid leaking secrets in errors or logs.
- Enforce RBAC and resource ownership in API services. Admin account must be seeded through a documented controlled mechanism; audit administrative decisions.
- Never put `.env` secrets, signing keys, access/refresh tokens, raw passwords, or full sensitive records in Git. Include `.env.example` only with safe placeholders.
- Do not send users' transaction records to third-party AI APIs or analytics vendors. Use synthetic data for demo.
- Add a small `docs/SECURITY.md` threat model: duplicate transfers, replay, insufficient funds, concurrent spending, session theft, CSRF/XSS, broken object authorization, SQL injection, racey admin approvals, and tampered webhook requests. Explain mitigations and remaining limitations honestly.
- Apply constraints even when the frontend is bypassed; demonstrate tests through direct API calls.

## 10. Reliability, observability, and advanced integration

After the core system works:

- **Immutable audit trail:** who initiated/approved/rejected/refunded, what entity changed, outcomes, correlation ID, timestamps, no plaintext sensitive tokens.
- **Reconciliation:** compare account balance projections to sums of posted ledger entries; flag nonzero differences and unbalanced journals; store run results and admin views. A legitimate successful run should show no mismatch; include controlled **test-only** corruption scenarios (in isolated test DB) that prove mismatch detection.
- **Event outbox:** for committed business events (e.g. transfer completed), persist an event in the **same DB transaction**. A local worker consumes events with retries/backoff and idempotent handlers. Do not rely on delivering notifications inside the financial transaction.
- **Redis + BullMQ:** optional for delayed processing, local webhooks, notifications, reconciliation scheduling. Keep money-posting correctness in PostgreSQL; queues are not the source of truth.
- **Webhook simulator:** signed local webhook payloads, replay prevention, receiver verification, delivery attempts, failure/retry visibility, no real provider claim.
- **Metrics:** request count, error rate, throughput, p50/p95 latency, transfer success/failure, queue depth where applicable, reconciliation status. Never invent data points.
- **Structured logs:** request/correlation IDs, event outcomes, sanitization, environment-appropriate verbosity; no request-body logging of secrets.
- **Backup/reset:** reproducible demo seed, safe test database reset, local DB dump/restore documentation. Never run destructive DB reset against an unknown or non-demo database.

## 11. Automated test plan and exact acceptance criteria

Create real tests and run them. Test scripts must have meaningful assertions rather than placeholder `expect(true).toBe(true)` statements.

### Core correctness tests

1. Registered demo user receives only the configured **balanced issuance** in the ledger.
2. Normal transfer of ₹500 from Rahul (₹2,000) to Priya (₹1,000) yields ₹1,500/₹1,500 and exactly one balanced journal.
3. Every posted journal has exactly balanced debit/credit totals, and the sum of user-facing balances matches ledger-derived values.
4. Invalid amounts (zero, negative, too many decimals, huge/overflow, string injection) are rejected without posting.
5. Insufficient funds, transfer-to-self, nonexistent/frozen recipient, unauthorized access are rejected without posting.
6. Repeating **the same idempotency key and same payload** returns the original outcome; no extra journal, no balance change.
7. Reusing a key with changed payload returns conflict; no money movement.
8. Fire 10–100 concurrent transfer attempts under a controlled test; totals remain correct and no wallet overspends. Include competing outgoing transfers whose combined values exceed available funds.
9. Simulate application failure before transaction commit; all tentative changes roll back. Simulate response loss after commit and retry; no second post.
10. High-risk transfer remains `PENDING_REVIEW` without posting; rejection posts nothing; approval posts once after **fresh** funds/status checks; duplicate approval attempts are idempotent/rejected safely.
11. Refund/reversal creates compensating journal, cannot exceed original posted amount, cannot double-refund, preserves immutable history.
12. Reconciliation passes after legitimate activity and detects corruption introduced in an isolated test fixture.

### Security/API/UI tests

- Registration/login/logout/refresh/expiration and revoked refresh token behaviors.
- Normal user cannot access admin routes or other users' wallets/transfer details; missing/bad tokens rejected.
- Input validation, error envelopes, rate limiting, HMAC replay protection in webhook phase.
- Browser E2E: register, log in, see wallet, fund demo, send, inspect history, log out; admin logs in, filters review queue, rejects/approves, checks audit and integrity.
- Mobile viewport smoke tests, keyboard-accessible forms, visible errors/loading/empty states.
- Unit tests for risk rule calculations and score explanations; deterministic fixtures.
- `npm run check` (format/lint/typecheck/test/build as appropriate) passes before declaring a milestone done.

### Benchmarking

Write a reproducible local load/concurrency script with configurable number of users, transfers, concurrency, duration, and seed. Produce actual throughput, p50/p95 response latency, errors, idempotency conflict/duplicate results, journal counts, and final balance invariants. Clearly state hardware, DB setup, dataset, and methodology. Distinguish **targets** from measured results. Do not claim 1,000+ TPS, p95 latency, or perfect reliability until actual benchmark/test results support it. Aim for 0 duplicate posted transfers and 0 ledger imbalances in the tested scenarios.

## 12. Demo data and impressive demo journey

Make repeatable synthetic accounts such as Rahul, Priya, and a dedicated demo admin. Seed realistic small transaction histories, a few flagged requests, and at least one risk-review case. Provide safe demo credentials in a **local-only** seed instructions file/terminal output, but never deploy shared demo credentials without explicit hardening.

Provide scripted demo:

1. Show landing page and login.
2. Show Rahul's ₹2,000 and Priya's ₹1,000 starting virtual balances.
3. Send ₹500; prove resulting ₹1,500/₹1,500 and show transfer details plus paired ledger entries.
4. Re-send the exact HTTP operation (same idempotency key) multiple times, including parallel requests; show only one posting.
5. Intentionally trigger an insufficient-funds error and show no partial movement.
6. Generate a suspicious burst/large transfer. Show the held request in admin review, explanations, and approve/reject action.
7. Show reconciliation, audit history, automated tests, and honest benchmark output.

The demo must run offline/local with no external accounts or paid services.

## 13. Documentation, presentation, and resume quality

Generate and maintain:

- `README.md`: problem, screenshot slots (use genuine screenshots once built), features, why it matters, stack, prerequisites, install, environment setup, migrations, seeding, run commands, test commands, demo walkthrough, limitations, future enhancements.
- `docs/ARCHITECTURE.md`: conceptual and deployment diagrams (Mermaid accepted), request sequence, risk decision flow, layer boundaries, queue/outbox role if present.
- `docs/DATA_MODEL.md`: tables, relationship diagram, ledger accounting conventions, sample journal, precision, immutable posting guarantees, state machine.
- `docs/API.md`: endpoint examples, authentication, example error responses, idempotency key and retry semantics.
- `docs/SECURITY.md`: threat model, controls, caveats, no real-money statement.
- `docs/TESTING.md`: matrix, commands, test DB setup, expected vs observed evidence.
- `docs/BENCHMARKS.md`: reproducible measured results, script, hardware, methodology; fill only once measured.
- `docs/DEMO.md`: 2–3 minute script plus optional video recording checklist.
- `docs/DECISIONS.md`: architecture decisions/tradeoffs (PostgreSQL vs other stores, immutable journal vs mutable balances, rules-first vs LLM, locks vs optimistic concurrency, local-first vs cloud).
- `docs/ROADMAP.md` and `docs/PROGRESS.md`: ordered phases, checkboxes, status, outstanding work, any deviations from spec.
- Resume bullet candidates that name implemented technologies/features **without fabricated numerical achievements**; after running tests, add optional measured metrics.
- One high-quality GitHub project description, short LinkedIn-style summary, and honest interview Q&A on race conditions, idempotency, ledger consistency, and risk false positives.

## 14. Implementation plan: phases and gates

Do not attempt all features at once. At each phase: implement, migrate (if needed), run tests, show actual command output/results, update `PROGRESS.md`, list remaining problems, then pause for my review unless I explicitly say to continue automatically.

**Phase 0 — Workspace, plan, foundations**
- Inspect existing files before modifying; if empty, initialize monorepo and scripts.
- Confirm stack/versions/environment and ask only truly blocking questions.
- Create architecture/data-model draft, roadmap/checklist, `.env.example`, local setup, lint/format/typecheck/test scaffolding, minimal health endpoint and minimal React shell.
- Establish source-control-safe ignores and a working dev startup.
- Gate: frontend runs, health endpoint works, database connects, lint/typecheck/build pass.

**Phase 1 — Database and authentication**
- Migrations for users/sessions/wallets/accounts/journal foundation.
- Secure register/login/refresh/logout/profile, role guards; admin bootstrap.
- Seed test/demo users and balanced simulated starting balances.
- Gate: auth and role API tests, unique users, reproducible seeds, basic user dashboard.

**Phase 2 — Double-entry ledger and transfer engine (highest priority)**
- Exact money representation, balanced entries, transactional journal posting, wallet balance projection, validation, durable idempotency, ownership checks, concurrency locks, state machine, detailed history.
- Gate: core 12 correctness tests relevant to this phase, including retries, concurrent overspending, failure rollback; no ledger mismatch.

**Phase 3 — Premium user experience**
- Complete responsive user pages with real API, transfer review/confirm, status timelines, filtered history, empty/loading/errors, demo funding.
- Gate: user E2E flow functional on desktop and mobile; no dead controls.

**Phase 4 — Risk and human review**
- Deterministic risk score/reasons, policy thresholds, pending-review lifecycle, admin review queue, approval/rejection with fresh balance check and audit records.
- Gate: safe/flagged/rejected/approved scenarios and multiple-reviewer races tested.

**Phase 5 — Operations and correctness proof**
- Admin analytics, transaction drilldowns, immutable audit, reconciliation, data integrity views, reversals/refunds with compensating postings, structured logging.
- Gate: visible reconciliation results, reversal invariants, admin RBAC tests, reliable logs.

**Phase 6 — Event reliability and local integrations**
- Transactional outbox, local worker, Redis/BullMQ only if useful, local signed demo webhooks, retries/backoff, replay protection, job status/health.
- Gate: intentional worker failures do not duplicate financial postings; replay and retry tests pass.

**Phase 7 — Optional ML and design refinement**
- Optional synthetic-data anomaly model with documented evaluation; never make paid LLM mandatory.
- Polish interactions, mobile responsiveness, accessibility, charts, and optional dark theme.
- Gate: no regressions; ML described honestly and fully decoupled from ledger correctness.

**Phase 8 — Quality, benchmarks, portfolio package**
- Run all checks, cross-browser smoke tests, seeded demo, load/concurrency benchmark, security checklist, docs, architecture diagrams, screen captures, recruiter demo and resume bullet options.
- Gate: clean fresh-install instructions, actual test results and metrics, no fake claims or TODO functionality in documented baseline.

Keep a **Must-have / Advanced / Optional** status marker in `PROGRESS.md` so the scope remains achievable. If blocked by optional Redis, webhooks, ML, CI, or chart tools, keep the baseline transfer app healthy and describe how to add the feature later rather than silently dropping it.

## 15. Explicit non-goals and safeguards

- Never connect actual bank/UPI/payment credentials; do not implement real-money deposits/withdrawals.
- Do not claim PCI DSS, RBI compliance, bank-grade security, certified fraud accuracy, or legal suitability.
- No paid subscriptions, API usage, cloud setup, domains, or deployment without asking me and stating any cost/limits.
- No generic fake data presented as live metrics. Seed data must be labeled synthetic.
- No generated screenshots posing as proof of a running application.
- Do not let AI directly execute SQL balance updates from natural-language prompts.
- No permanent disabling of security controls just to make the demo easy.
- No silent destructive operations on existing databases or non-demo environments. Confirm exact target before reset.
- Avoid huge unreviewable files, duplicated business logic, and prematurely complex microservices; use a modular monolith.

## 16. Your interaction protocol as my coding assistant

**Before coding:**
1. Inspect the repository and environment. If there is existing code, preserve user-owned work and identify conflicts before edits.
2. Summarize the proposed architecture, phase plan, key ledger invariants, and any genuinely blocking questions in a concise response.
3. Identify what is explicitly in the original project presentation versus implementation choices you are making.
4. Start **Phase 0** and actually modify files, unless a blocking question prevents it.

**While coding:**
- Make small, understandable changes; state which phase you are implementing.
- Prefer typed, maintainable, secure implementations over impressive-looking boilerplate.
- Install only necessary dependencies; use lockfiles and compatible stable versions.
- Implement routes, services, migrations, tests and UI end-to-end—not unconnected placeholder files.
- When failures arise, diagnose and fix them. Do not claim passing tests without running them.
- If a tool or environment does not allow actual commands/files, be honest, give exact next steps, and never hallucinate results.

**At each phase completion, respond with:**
1. **Built:** exact working features and important files.
2. **Verified:** commands run and real outcomes.
3. **How to try it:** minimal local run/demo steps.
4. **Open issues:** remaining defects, limitations, and security cautions.
5. **Next phase:** concrete checklist and whether approval is needed.

**First task now:** Begin Phase 0 for LedgerGuard in this workspace. Inspect the project directory, propose the foundational structure and ledger-safe data model, initialize the app/API/shared packages, configure PostgreSQL locally, create the first migration, launch a simple health endpoint and styled frontend shell, add tests, and verify it. **Do not skip ahead to generating all later phases in one answer.**

# END MASTER PROMPT

---

## Final portfolio checklist (for you, the project owner)

- [ ] Working local React web app and Express API
- [ ] PostgreSQL migrations and resettable synthetic demo data
- [ ] Secure user and admin authentication
- [ ] Virtual wallets, transactional posting, immutable balanced journals
- [ ] Reliable idempotent transfers and demonstrated concurrency safety
- [ ] Transfer history, success/failure/pending states
- [ ] Explainable fraud risk signals and admin review
- [ ] Audit logs, reconciliation, reversing entries/refunds
- [ ] Automated tests including duplicated requests and failure recovery
- [ ] Responsive design, accessibility, honest error/empty/loading states
- [ ] Real benchmark output and a recorded demo
- [ ] Thorough README, architectural diagrams, GitHub repo and resume bullets

**Remember:** A good recruiter story is “I built a transactional ledger and proved it handles duplicate requests and concurrent transfers,” not “I made an AI finance website.”
