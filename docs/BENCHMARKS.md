# Measured local benchmark

Measured **27 October 2026, 19:35 IST**. Machine: Apple M1, 8 GiB RAM, macOS arm64; Node 22.21.1; PostgreSQL 15.19 (Homebrew). Exact captured output: [benchmark-results.json](benchmark-results.json).

| Measure                         |                Observed |
| ------------------------------- | ----------------------: |
| Unique ₹1 transfer intents      |                     100 |
| Synthetic users                 |                      10 |
| Concurrency                     |                      10 |
| Duplicate retries               |                      20 |
| Changed-payload conflicts       |       10 (expected 409) |
| HTTP requests                   |                     130 |
| Wall time                       |                  244 ms |
| Requests/second, this short run |                  532.76 |
| p50 HTTP latency                |                11.44 ms |
| p95 HTTP latency                |                54.39 ms |
| Unexpected errors               |                       0 |
| Unique transfer journals        |                     100 |
| Unbalanced journals             |                       0 |
| Total starting / final paise    | 10,000,000 / 10,000,000 |

## Reproduce

```sh
npm run benchmark
# Optional bounded configuration:
BENCH_USERS=20 BENCH_TRANSFERS=200 BENCH_CONCURRENCY=20 npm run benchmark
```

The script uses only `settlecraft_test`, creates fresh synthetic wallets via balanced issuance, starts an ephemeral loopback Express listener, and exercises access-token authorization, Zod validation, idempotency, risk evaluation, wallet locks, ledger/audit/outbox writes and SQL constraints. It checks preserved aggregate balances, one journal per intent, and globally balanced journals. Authentication setup/fixture creation is excluded from timing. Samples include successful requests, duplicate retries, and expected 409 conflicts. Existing test data and a warm filesystem cache affect the result.

This is a **short, local correctness-oriented burst**, not sustained production capacity or a general TPS claim. No internet latency, TLS, multiple application hosts, prolonged soak, resource saturation, or failover benchmark was performed. Each rerun overwrites the JSON; update this report if quoting a new run. The separate concurrency test deliberately overspends a ₹2,000 wallet with twelve competing ₹300 intents, proving six complete and six fail without overdraft. Worker crash recovery and response-loss idempotency are tested independently.
