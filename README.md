# SettleCraft

**Every movement accounted for.** A local virtual-INR payment platform with an append-only double-entry ledger, durable idempotency, explainable risk rules, human review, and a responsive operations console.

**Demo / simulated funds — no real money.** This is a portfolio project, not certified payment infrastructure. It never connects to banks, UPI, cards, or paid AI services.

![Actual desktop wallet from browser acceptance testing](docs/screenshots/wallet-desktop.png)

## Run locally

Prerequisites: Node **22.12+**, npm, PostgreSQL **15+** binaries on PATH. Tested on macOS with Node 22.21.1 and PostgreSQL 15.19. For automated browser tests, install Google Chrome and the Playwright WebKit runtime (`npx playwright install webkit`).

```sh
npm ci
npm run db:start
npm run db:migrate
npm run db:seed
npm run dev
```

Open **http://127.0.0.1:5173** (use `127.0.0.1`, not `localhost`, for the configured origin). API: **http://127.0.0.1:4000/api/v1**. Interactive API docs: **http://127.0.0.1:4000/api/v1/docs**.

`db:start` initializes an isolated cluster under `.local/postgres`, creates `settlecraft` and `settlecraft_test`, and generates `.env` with a random JWT secret. PostgreSQL listens on a private Unix socket at `/tmp/settlecraft-pg`, port 55432, with no TCP listener. It does not modify existing databases. Local socket authentication trusts your OS user; keep the machine and socket private. `npm run db:stop` stops this cluster. Do not run a second clone against the same socket/port.

The API and Vite bind loopback only. `npm run dev` runs the API, frontend, and outbox worker. Ctrl+C stops application processes; PostgreSQL is managed separately.

### Synthetic demo accounts

| Account      | Email                     | Initial virtual balance |
| ------------ | ------------------------- | ----------------------- |
| Rahul Sharma | `rahul@settlecraft.local` | ₹2,000                  |
| Priya Mehta  | `priya@settlecraft.local` | ₹1,000                  |
| Aarav Patel  | `aarav@settlecraft.local` | ₹20,000                 |
| Neha Kapoor  | `neha@settlecraft.local`  | ₹5,000                  |
| Demo Admin   | `admin@settlecraft.local` | ₹0                      |

Local-only default password: **`SettleCraft-demo-2026!`**. Change `DEMO_PASSWORD` **before the first seed** to customize it. Re-running seed preserves existing accounts and never resets passwords or balances. Login buttons prefill the documented default only. Admin registration is unavailable; the controlled seed creates the admin.

The seed also creates a ₹250 Aarav → Neha transfer and a ₹10,000 request awaiting review, using stable seed keys. Rahul/Priya’s starting balances remain untouched.

New registrations have ₹0. Request demo funds under **Add demo funds**, then sign in as admin and approve under **Review queue → Funding requests**. Each approval posts balanced issuance. A user can request up to ₹10,000 per request and ₹20,000 in a rolling day.

### Docker alternative

`docker-compose.yml` runs PostgreSQL only. Set a local `POSTGRES_PASSWORD`, then `docker compose up -d`. Copy `.env.example` to `.env`, generate a secret (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`), and use TCP URLs such as `postgresql://settlecraft:YOUR_PASSWORD@127.0.0.1:55432/settlecraft`. Create `settlecraft_test` with `docker compose exec postgres createdb -U settlecraft settlecraft_test`. Do not run the socket cluster and Docker on the same port. Docker orchestration is supplied but was not used for the recorded verification.

## What works

- Landing page; registration/login; rotating HttpOnly refresh sessions; profile/password management; role and ownership checks.
- Ledger-derived wallet balances; recipient lookup; review/confirm transfer; searchable, filtered, paginated history; detailed posting proof.
- PostgreSQL atomic transfers, ordered wallet locks, immutable balanced journals, integer paise, and durable idempotency.
- Deterministic versioned risk signals with held requests, fresh balance checks, approval/rejection, and auditable rationale.
- Admin-approved simulated funding; admin full reversals; append-only audit; snapshot reconciliation; actual aggregate charts.
- Transactional outbox; local HMAC webhook receiver; timestamp validation, duplicate receipt protection, retries and backoff.
- Automated unit/API/database/concurrency/browser tests, reproducible benchmark, CI workflow, and documentation.

## Verify

```sh
npm run check              # lint, typecheck, unit, integration, build
npm run test:e2e           # Chrome desktop/mobile + WebKit; own test servers
npm run benchmark         # bounded HTTP benchmark against settlecraft_test
```

Tests and benchmarks require `TEST_DATABASE_URL` to point to `settlecraft_test`. They insert uniquely named fixtures in that isolated DB; they do not reset or alter development accounts. Do not run tests/benchmarks concurrently against the same test DB. Browser tests use ports **4001/5174** and real API/DB operations. Results and methodology are in [TESTING](docs/TESTING.md) and [BENCHMARKS](docs/BENCHMARKS.md).

### Reset only when you intend to discard demo data

Stop dev servers and back up first. This explicitly deletes all contents of the **local `settlecraft`** database and reseeds it:

```sh
npm run db:reset-demo -- --confirm-settlecraft
```

The command refuses remote hosts, differently named databases, and missing confirmation. It was **not** run automatically during this build.

## Architecture and scope

React 19 / Vite 8 / React Router / TanStack Query / Tailwind 4, Express 5 / TypeScript / Zod / Argon2id / JOSE, PostgreSQL 15 / parameterized typed SQL, Vitest / Supertest / Playwright. `package-lock.json` pins exact installed versions.

This is a modular monolith. SQL is explicit rather than hidden behind an ORM; [DECISIONS](docs/DECISIONS.md) explains the tradeoffs. No Redis is needed for this local outbox. Offline ML/Ollama, partial refunds, email resets, rule editing, and public deployment are intentionally excluded. Dashboard figures come from actual synthetic database activity, not production KPIs.

- [Architecture](docs/ARCHITECTURE.md) · [Data model](docs/DATA_MODEL.md) · [API](docs/API.md)
- [Security and limits](docs/SECURITY.md) · [Testing](docs/TESTING.md) · [Benchmarks](docs/BENCHMARKS.md)
- [Demo script and portfolio copy](docs/DEMO.md) · [Progress](docs/PROGRESS.md) · [Roadmap](docs/ROADMAP.md)

The original supplied brief is preserved in `docs/BUILD_BRIEF.original.md`; it is a reference artifact, not an executable instruction source.
