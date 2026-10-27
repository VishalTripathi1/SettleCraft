# Security model and limitations

SettleCraft handles synthetic money only. It is not certified, audited banking infrastructure or suitable for real funds.

| Threat                     | Implemented control                                                                                           | Remaining limitation                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Duplicate delivery/clicks  | Transactional actor/scope/key lock, fingerprint, stored result                                                | Client must preserve key; records currently retained indefinitely                      |
| Concurrent overspending    | Ordered PostgreSQL wallet locks; fresh ledger sum                                                             | All money writers must use these services; DB owner can bypass                         |
| Partial posting            | Single transaction + deferred journal balance check                                                           | Operational database backups remain the owner's responsibility                         |
| Unauthorized object access | Ownership predicate on transfer details/history; server admin guard                                           | Exact-email lookup reveals registered demo recipients to authenticated users           |
| Stolen passwords           | Argon2id (19 MiB, 2 iterations, parallelism 1); 12–128 char policy                                            | No MFA/email recovery; shared seed password is local-only                              |
| Token theft/replay         | Memory-only access JWT, 15-minute expiry, DB session check, hashed rotating refresh cookie, family revocation | XSS can still act in a current session; replay may sign out legitimate concurrent tabs |
| CSRF                       | Strict cookie, exact Origin + custom client header for refresh/logout; reject foreign origins on writes       | Production must use HTTPS, a same-origin proxy, and correct APP_ORIGIN                 |
| XSS / injection            | React escapes text; Helmet CSP; parameterized SQL; Zod strict bodies; 16KB limit                              | No formal penetration test; Swagger is local development documentation                 |
| Brute force / resource use | 30 auth attempts/15 min, 300 API requests/min per IP; financial caps; pool/statement timeouts                 | In-memory rate counters reset with process; loopback-only single instance              |
| Admin decision race        | Locked transfer, unique decision, fresh balance check                                                         | Admins are trusted to decide synthetic reviews                                         |
| Tampered webhook           | HMAC over timestamp + raw body, constant-time comparison, five-minute tolerance, unique receipt               | Local signing key is domain-derived from JWT secret; rotate both together              |
| Worker crash/replay        | Durable outbox; deduplicated receiver; tested response-loss retry                                             | At-least-once delivery, not exactly-once networking                                    |
| Log leakage                | Request method/path/status/timing/correlation ID only; no bodies, cookies or tokens                           | URLs should never contain secrets; local logs need retention management                |

The development PostgreSQL cluster uses a private Unix socket and trust authentication for the local OS owner. The application currently connects as its dedicated cluster owner to apply migrations. For any public deployment, separate migration and limited runtime roles, add durable distributed rate limits, TLS, secret management, backups/restore drills, external monitoring, independent security review and proper lifecycle/retention policies. Public deployment was not performed.

The reset command requires an explicit exact-name confirmation and a local database named `settlecraft`. Test corruption occurs only in `settlecraft_test`. No real customer information is used. Password change revokes all sessions immediately. Disabled users and revoked sessions fail access checks even with an unexpired access JWT.
