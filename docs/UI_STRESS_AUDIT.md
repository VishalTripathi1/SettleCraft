# UI and payment-feedback stress audit

Date: 28 October 2026. Scope: the redesigned authentication and wallet interface, payment feedback, incoming activity, and related regression checks. Runs used local services and the isolated `settlecraft_test` database. Synthetic network responses were used only for adverse UI scenarios; the full payment journey used the real API and ledger.

## Issues found and fixed

| Issue                                                   | Reproduction                                                                              | Fix                                                                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Mobile navigation lost keyboard focus                   | Open the drawer, press Tab repeatedly or Escape; WebKit also skipped native focus targets | Explicit focus cycling, Escape dismissal, focus restoration, inert background, and hidden/inert closed navigation               |
| Stale balance after outgoing activity elsewhere         | Append a debit in the polled ledger while keeping the dashboard open                      | Refresh wallet, ledger and transaction queries for new debits as well as credits; credits alone trigger a received-funds notice |
| Long profile names caused horizontal scrolling          | An 80-character name without spaces at 320px                                              | Allow heading and wallet-name text to wrap within their layout                                                                  |
| Large amount clipped inside the balance card            | Display ₹99,99,99,999.99 at 320px                                                         | Adapt large-balance typography and allow amount wrapping without losing digits                                                  |
| Missing document landmarks                              | Inspect all Axe severities on the workspace                                               | Semantic main and footer landmarks                                                                                              |
| Expanded test suite exhausted authentication throttling | More than 30 login attempts from the same test address in one server run                  | Start a fresh test server per browser through `scripts/browser-tests.mjs`; production limits remain unchanged                   |

The closed mobile drawer also initially appeared as a second dialog during a funding approval check. Its dialog role is now applied only while open, and the closed drawer is hidden from interaction and the accessibility tree.

## Coverage

- Real registration, administrator-approved funding, transfer posting, ledger detail, profile editing, reconciliation and logout.
- Separate sender and recipient browser sessions: a real posted transfer triggers the recipient's funds-received notification.
- Delayed sign-in, service-unavailable responses, repeated submission and keyboard retry.
- Delayed completed, held and failed payment responses: progress appears during the request and success is never shown before confirmation.
- Lost payment responses: retries preserve both the idempotency key and request body.
- Historical-credit suppression, new-credit notifications, dismissal without replay, outgoing-activity refresh and reduced-motion behavior.
- Mobile drawer focus containment, Escape dismissal and focus restoration.
- Login and registration at 320, 375, 768, 1024 and 1920 pixels, including a short landscape viewport.
- Large balances and maximum-length unbroken names, checked for internal clipping and page overflow.
- Axe scans at every reported severity on landing, login and eight authenticated screens.
- Existing unit/API tests and database integration coverage, including balanced immutable journals and transfer concurrency safeguards.

## Final verification

- **42 browser cases passed**: 14 each in WebKit, desktop Chrome and mobile Chrome, using fresh test servers per browser.
- **34 non-browser tests passed**: 17 unit/component/API tests and 17 PostgreSQL integration tests.
- All tested Axe severities pass on the ten scanned screens in all three browser configurations.
- ESLint, strict TypeScript, production build, Prettier and Git whitespace checks pass.
- The repaired 320px large-balance/long-name view was visually inspected; document width remained 320px and all amount digits were visible.

## Limits

This is a local adversarial UI and regression audit, not production security certification or an endurance/load test. Automated accessibility checks do not replace testing with real assistive technologies. Incoming notices poll a bounded 20-entry ledger window every five seconds while active; they are not a durable notification inbox. Network failures and extreme display data were injected in browser tests, while ledger correctness was verified separately against PostgreSQL.
