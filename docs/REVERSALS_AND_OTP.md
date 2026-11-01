# Reversal requests, unified history and email verification

## Local setup

Run `npm run db:start`, `npm run db:migrate`, then `npm run dev`. Migrations are forward-only and preserve existing ledger history.

For real email OTP:

1. Create a Brevo account and complete its transactional sending/sender verification requirements. The free allowance is subject to Brevo's limits and account approval.
2. Create a **transactional API key**, not an SMTP key.
3. Set `BREVO_API_KEY` and `MAIL_FROM` in the root `.env`. `MAIL_FROM` must be your verified sender. Keep secrets out of Git and chat.
4. Restart the API. Register a SettleCraft account with an email inbox you control. Seeded `.local` addresses cannot receive email; no address substitution or shared demo inbox is provided.
5. Request and approve sufficient simulated funding. Submit a ₹10,000 transfer, click **Send verification code**, enter the code, and select **Verify & complete payment**.

Implementation uses [Brevo's transactional email API](https://developers.brevo.com/docs/send-a-transactional-email). No new dependency, SMS service, paid plan, or domain purchase is imposed by the code. Provider sender/domain requirements still apply. Missing configuration returns `EMAIL_NOT_CONFIGURED`; provider rejection/timeouts return a generic delivery error and leave funds untouched. A successful send means the provider accepted the message, not guaranteed inbox delivery. Actual delivery must be verified with your configured account.

## Payment verification policy 2.0

A payment of ₹10,000 or more requires email verification when non-amount risk points total less than 60. Other suspicious activity may require admin review. Account age never removes the amount verification requirement. Existing amount-only review holds are moved to `PENDING_VERIFICATION` by migration 005, with an audit event. Existing risk records remain immutable evidence of their original policy.

`CREATED → PENDING_VERIFICATION → PROCESSING → COMPLETED` is the usual path. Verification can instead produce `FAILED` if funds/accounts changed or `PENDING_REVIEW` if other risk signals now warrant human review. Held funds are not reserved. Administrators cannot directly approve a payment in `PENDING_VERIFICATION`.

**The payment itself expires 15 minutes after creation**, independently of the five-minute code. Resending never extends this deadline. The worker changes overdue `PENDING_VERIFICATION` payments to `FAILED`, records `PAYMENT_VERIFICATION_EXPIRED`, and moves no funds. Send/confirm endpoints enforce the same deadline under the transfer lock even if the worker is offline. Start a new payment after expiry.

Codes are six random digits, valid for five minutes, stored as a server-keyed HMAC bound to a challenge and immutable payment. Five attempts per code; 60-second resend cooldown; five codes per payment; 20 sends per sender in the rolling hour (conservatively counts all sends for challenges active that hour). API rate limits also apply. A resend supersedes the prior challenge. Exhausting the per-payment send limit leaves the payment unposted; start a new intent if still needed, and do not assume the old intent completed. Failed delivery consumes a send allowance and can be retried after cooldown. There is no production test code, browser-exposed OTP, logging of codes, or bypass when email is unavailable.

Sending email occurs outside database locks. Correct-code confirmation locks the transfer and wallets, rechecks funds and risk, consumes the challenge and posts in one transaction. Invalid-attempt counters commit before an error is returned. Concurrent confirmation and same-code lost-response retries return the committed outcome without posting again.

## Reversal requests

On a completed outgoing payment, **Request reversal** is available when no pending/queued/approved request or reversal exists and both accounts/wallets are active. A request can be submitted even if the recipient already spent the funds. The modal shows payment facts, a reason selector, a required explanation (5–1,000 trimmed characters) and a refund disclaimer.

Users track requests from payment details or **Reversal requests**. Administrators use **Operations → Reversal requests**, search/status/UTC date filters, then open a request to inspect eligibility, original risk, prior reversals, notes and audit records. Approval/rejection requires a reason and confirmation. The admin sidebar shows numeric badges for outstanding reversal requests (pending + queued) and payment/funding reviews. Counts refresh every five seconds. The overview also shows pending reversal count.

Lifecycle: `PENDING → APPROVED | QUEUED | REJECTED | FAILED`; `QUEUED → APPROVED | FAILED`. Approved means the linked reversal journal has committed. Rejection never posts money. Insufficient unreserved recipient funds persist `QUEUED` with the administrator’s authorization and queue time. Other business-rule failures persist `FAILED` with a reason; unexpected infrastructure errors roll back and leave the request pending for retry. Approved/rejected/failed financial outcomes are terminal and immutable. Queued authorization is durable and remains outstanding until settlement. Repeating the same decision returns its recorded outcome (including queued authorization); a conflicting decision returns 409. Users may submit a fresh request after rejection/failure if the payment is still eligible. A partial unique index allows at most one pending or queued request per payment.

Both request approval and **Review reversal** on the admin payment detail call `reverseInTransaction`, the original reversal engine extracted into a transaction-aware function. Lock order is transfer → request → ordered wallets. The compensating journal, reversal record, request approval and audit events commit together. A direct admin reversal automatically approves and links a pending or queued request with a `REVERSAL_REQUEST_RESOLVED` event and the direct admin rationale. Original transfers/ledger entries stay intact. The existing unique reversal-per-transfer constraint prevents duplicate refunds.

## Queued refunds and reserved funds

Admin approval with insufficient unreserved funds records `QUEUED` (shown as **Queued for funds**), not a completed refund. The existing background worker polls approximately every two seconds and processes the oldest authorized refund per debtor first. `npm run dev` starts that worker in watch mode so edits reload it; `npm run worker` runs it independently. Restarting the worker preserves the queue because its state is in PostgreSQL. Multiple workers use locks and the unique reversal constraint to prevent duplicate settlement.

Available and incoming funds are reserved toward queued obligations. For example, a ₹1,000 queued refund with ₹200 in the wallet shows ₹200 reserved and ₹0 available. An additional ₹300 remains reserved; an additional ₹500 permits one full ₹1,000 reversal. There are no partial financial postings. Ordinary outgoing transfers, held-transfer approvals, OTP completion and unrelated direct reversals cannot spend funds reserved for the queue. Both accounts/wallets must be active before settlement; frozen queues wait for reactivation. No money is created or balance made negative to satisfy a refund.

`GET /wallets/me` preserves `balance` as the ledger balance and adds `available_balance`, `reserved_balance`, `reversal_obligation` and `queued_reversals`. The dashboard displays spendable balance and explains the reservation. These are SQL-derived projections, not mutable balance caches. The worker adds `REVERSAL_QUEUE_SETTLED` audit evidence when the compensating journal commits. An approved request that queues is idempotent on approval retry and cannot acquire a second active request.

## Inactivity logout

Default inactivity timeout is **15 minutes**, configurable with `SESSION_IDLE_MINUTES` (1–1,440). The browser warns in the final minute and offers **Stay signed in**. Foreground pointer, keyboard, touch and scroll activity sends a throttled heartbeat. Background polling, token refresh and ordinary GET requests never extend the server-side idle deadline. Tabs can share foreground activity notifications; the server remains the authority.

`GET /auth/session` returns remaining milliseconds and the configured duration. `POST /auth/activity` extends only a still-active authenticated session. Refresh rotation preserves the previous activity time. Expired access and refresh sessions cannot be revived by a heartbeat. The browser clears sensitive cached views and returns to login when idle, including after a sleeping/background tab resumes. API clients that need an interactive session must explicitly send activity heartbeats while the user is active; unattended polling is insufficient.

## Unified history

`GET /history` and `/admin/history` use a SQL `UNION ALL` of transfers and committed reversals, joined to financial journals. The existing `/transfers` semantics are preserved. History amounts are unsigned paise strings plus `signed_amount` for the authenticated wallet; `direction` is `INCOMING` or `OUTGOING` (null in admin history, where no single wallet is implied). Reversal participants are inverted relative to the original payment.

Each entry has `history_id` (`TRANSFER:uuid` or `REVERSAL:uuid`), `type`, `id`, `transfer_id`, `reference`, `original_reference`, `amount`, `currency`, `status`, participant IDs/names, own `created_at`, `journal_id`, and optional `request_id`. Reversal amounts derive from committed credit entries. Reversal times are journal posting times. Original transfer status remains completed even after reversal.

Sorting is `(created_at DESC, history_id DESC)` across the combined set; page size 20, accurate total even on an empty page. Filters: `page`, `search`, `type`, `direction`, `status`, `from`, `to`. Dates use UTC day boundaries, inclusive `from`/`to`. User query scope is always derived from authentication, never supplied user IDs. Admin history has no wallet-relative direction; omit that filter. Transfers and reversals remain separate rows, each with meaningful linked details.

Client mutations invalidate relevant React Query caches. Request/details pages poll every five seconds; wallet activity also invalidates balances and histories when new debits or credits appear. Navigation/refocus refreshes stale data. This is polling, not push/websockets.

## API additions (prefix `/api/v1`)

| Method | Path                                    | Access / purpose                                              |
| ------ | --------------------------------------- | ------------------------------------------------------------- |
| POST   | `/transfers/:id/reversal-requests`      | Original sender; `{reason,notes}`, `Idempotency-Key` required |
| GET    | `/transfers/:id/reversal-requests`      | Sender's requests for this payment                            |
| GET    | `/reversal-requests`                    | Own paginated requests; status/search/from/to/transferId      |
| GET    | `/reversal-requests/:id`                | Owner details                                                 |
| GET    | `/admin/reversal-requests`              | Admin paginated queue                                         |
| GET    | `/admin/reversal-requests/:id`          | Admin detail including eligibility/risk/audit                 |
| POST   | `/admin/reversal-requests/:id/decision` | Admin `{decision: APPROVE or REJECT,rationale}`               |
| GET    | `/history`                              | Authenticated wallet's combined history                       |
| GET    | `/admin/history`                        | Admin combined history                                        |
| GET    | `/reversals/:id`                        | Financial participants or admin; details and ledger proof     |
| POST   | `/transfers/:id/verification/send`      | Sender; deliver email code                                    |
| POST   | `/transfers/:id/verification/confirm`   | Sender `{code}`; verify and process                           |

Additional endpoints: `GET /admin/request-counts` returns `reversal_pending`, `reversal_queued`, `transfer_reviews`, `funding_requests`; `GET /auth/session` returns `{remainingMs,idleTimeoutMs}`; `POST /auth/activity` records authenticated foreground activity.

Request reasons: `WRONG_RECIPIENT`, `INCORRECT_AMOUNT`, `DUPLICATE_PAYMENT`, `MISTAKE`, `OTHER`. Explanation/notes is required, 5–1,000 trimmed characters. Historical explanations are not rewritten. Admin rationale 5–500 characters. Recipient access to the financial reversal does not grant access to the sender's request notes. No arbitrary user filter can bypass request ownership.

## Migrations

- `004_reversal_requests_and_verification.sql`: request table, relationships/checks/indexes, immutable terminal lifecycle, OTP challenge table, verification transfer state, reversal timestamp index.
- `007_verification_expiry.sql`: partial index for the 15-minute verification expiry sweep.
- `006_queued_reversals_and_idle_sessions.sql`: durable QUEUED state, active-request uniqueness, spendable/reserved wallet view and session activity timestamps.
- `005_verification_policy.sql`: VERIFY risk action, permitted review-to-verification transition and audited migration of existing eligible amount-only holds. Never rerun seed or reset to apply these features.

## Demo walkthrough

1. Fund a sender with ₹2,000. Send ₹1,000 to another wallet.
2. Confirm both histories contain the original payment and balances are ₹1,000 each (recipient started at zero).
3. Open the payment as sender, request reversal, and choose a reason. Balances remain unchanged.
4. Open the admin reversal queue. Inspect the request and approve it with a reason.
5. Sender sees **Reversal received +₹1,000**; recipient sees **Reversal sent −₹1,000**. Both retain the original payment.
6. Open the reversal and navigate back to the original payment. The request shows approved and its linked reversal.
7. Run reconciliation. Retry the approval through the API: no second refund.
8. Repeat with a rejection: no funds move. Separately try the existing admin **Review reversal** action, including while a user request is pending.

Email delivery is separate from local reversal functionality. Reversals require no external provider.

### Queued-refund demo

After the recipient spends a payment, the sender can still submit a request with a required explanation. Admin approval shows **Queued for funds**. Fund the recipient partially: available balance stays zero while the partial amount is reserved. Add the remainder: the running worker posts the full compensating reversal and both histories update. The sidebar badge and request status update through polling. If the worker is stopped, funds remain reserved and the queue settles after it restarts.
