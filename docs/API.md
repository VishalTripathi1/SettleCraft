# API guide

Base: `/api/v1`. Live OpenAPI JSON: `/api/v1/openapi.json`. Swagger UI: `/api/v1/docs`. Money inputs are decimal strings; ledger amounts/balances are integer-paise strings. `X-Request-Id` links responses to structured request logs and audit records.

## Authenticate

```sh
curl -s http://127.0.0.1:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"rahul@settlecraft.local","password":"SettleCraft-demo-2026!"}'
```

Use the returned accessToken in `Authorization: Bearer ...`; do not put it in URLs or browser storage. Browser refresh uses the HttpOnly cookie, exact `Origin: http://127.0.0.1:5173`, and `X-SettleCraft-Client: web`. Logout has the same cookie-write protections. Tokens expire after 15 minutes; refresh sessions after seven days. Reusing a rotated refresh token revokes its family.

## Transfer intent

Look up a recipient with `GET /users/lookup?email=priya%40settlecraft.local`. Then:

```http
POST /api/v1/transfers
Authorization: Bearer YOUR_ACCESS_TOKEN
Idempotency-Key: YOUR_UNIQUE_INTENT_UUID
Content-Type: application/json

{"recipientId":"RECIPIENT_UUID","amount":"500.00","currency":"INR","note":"Shared lunch"}
```

201 returns the persisted intent, including status, reference, amount in paise, and journal ID when completed. FAILED is a durable business outcome in the response, not a transport error. Inspect status before showing payment success.

- Same actor + scope + key + canonical payload returns the original serialized response.
- Same key with a changed payload gives 409. Decimal equivalents (`500`/`500.00`) canonicalize to the same paise value.
- Network error before commit: rollback, then retry the same key/body.
- Response lost after commit: retry returns the existing result without posting again.
- Held transfer later approved: retry still returns the original PENDING_REVIEW response; `GET /transfers/:id` returns current state.
- Financial client POSTs have no automatic network retry. The confirm form preserves the intent key for explicit retry.

Lists have deterministic timestamp/UUID ordering. `/transfers` and `/admin/transfers` support page (20 items), search (name, note, reference) and status. `/admin/audit` supports page (30 items) and search (action). Ledger activity returns 20 entries per page. Review and funding queues return the oldest 100 pending records; deciding them reveals the next batch. Topup history returns the latest 30; reconciliation latest 10; events latest 30. These explicit bounds are a local-demo limitation.

## Other operations

| Method | Route                                     | Behavior                                              |
| ------ | ----------------------------------------- | ----------------------------------------------------- |
| GET    | `/wallets/me`                             | Derived balance, wallet status                        |
| POST   | `/wallets/me/demo-topups`                 | `{amount}` + idempotency key; pending admin approval  |
| PATCH  | `/users/me`                               | `{name}` only                                         |
| POST   | `/auth/change-password`                   | `{currentPassword,newPassword}`; revokes all sessions |
| GET    | `/admin/reviews`, `/admin/topups`         | Pending queues                                        |
| POST   | `/admin/reviews/:id`, `/admin/topups/:id` | `{decision:"APPROVE" or "REJECT",rationale}`          |
| POST   | `/admin/transfers/:id/reverse`            | `{rationale}` + idempotency key; full reversal only   |
| POST   | `/admin/reconciliation/run`               | Persist snapshot invariant check                      |
| GET    | `/admin/risk-rules`                       | Policy version, rules, review threshold               |
| GET    | `/admin/events`                           | Event attempts, next retry, last error, receipt count |

Server enforces admin roles. Users cannot fetch another user's transfer unless they are one of its participants. No direct balance-write endpoint exists.

## Errors

```json
{
  "code": "IDEMPOTENCY_CONFLICT",
  "message": "This request key was already used with different details.",
  "requestId": "correlation-uuid"
}
```

400 malformed JSON, 401 missing/invalid session, 403 role/origin denial, 404 missing/inaccessible record, 409 conflict/state decision, 413 oversized body, 422 validation, 429 rate/cap limits, 500 generic internal failure, 503 unavailable DB readiness. Validation may include field details. Stack traces are never sent to clients.

## Local events

Run `npm run worker` separately, or use `npm run dev` which includes it. The worker POSTs only to the loopback demo receiver. HMAC-SHA256 signs `timestamp.rawBody`; timestamp tolerance is five minutes. Receiver verifies the event exists in the outbox and stores one immutable receipt. Duplicate signed events return `{accepted:true,duplicate:true}` without applying an action twice.

Delivery never changes balances. Failed attempts retry with exponential delay, maximum 10 attempts. Exhausted events remain visible for diagnosis; automatic retry stops. There is no general arbitrary-URL webhook feature, avoiding SSRF and external data transmission. A production dead-letter/requeue workflow is future work.

## Reversal requests, history and OTP (policy 2.0)

See [the detailed API contract](REVERSALS_AND_OTP.md#api-additions-prefix-apiv1) and the generated `/api/v1/docs` for the new routes. `/transfers` remains transfer-only; `/history` is the combined paginated feed. `/admin/overview` additionally returns `pendingReversals`. Transfer detail additionally returns `reversal_eligible` and `reversal_request_eligible` (request eligibility does not require currently sufficient funds). Payment status now includes `PENDING_VERIFICATION`; risk action includes `VERIFY`.

Queued-refund/session additions: reversal status also includes `QUEUED`; request `notes` is required (5–1,000 trimmed characters). `GET /admin/request-counts` supplies sidebar counts. Wallet detail preserves ledger `balance` and adds spendable/reserved amounts and queued obligations. `GET /auth/session` reports the idle deadline; `POST /auth/activity` renews it only for an active session. Ordinary polling and refresh rotation do not extend the default 15-minute idle timeout.

Pending verification payments become `FAILED` 15 minutes after creation with a readable `failure_reason`; requesting a new OTP does not extend the payment deadline. Expiry is enforced by both the worker and OTP send/confirm handlers. Expiry never posts a ledger journal.
