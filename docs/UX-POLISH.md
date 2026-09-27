# Customer and owner polish — September 27, 2026

The existing cream, green, orange, serif accents, and editorial homepage remain.

## Customer experience

- Service-card links select the requested service without clearing entered details.
- Request/review steps, keyboard focus, readable mobile fields, PDF checks, and price confirmation are clearer.
- A network or non-JSON provider error leaves the request retryable; browser storage failures no longer prevent ordering.
- The existing request fingerprint format and idempotency keys are preserved.
- Rush copy follows the current business settings.

## Owner experience

- Dashboard status distinguishes the deployment switch, business pause, policy approval, and service failures.
- Orders use readable status labels and mobile cards, with an explicit empty state and correct next-page detection.
- Order details show a payment breakdown, next-step guidance, and readable activity dates.
- Balance actions expose the returned Stripe payment link and reuse existing invoices. Fully paid orders offer delivery rather than another balance request.
- Sign-in supports resending, a short resend cooldown, changing email, code paste, and clearer provider errors.
- Settings flag unsaved changes and prevent an empty service selection. Failed actions and sign-out report errors without claiming success.
- Loading and recoverable error screens keep navigation available.

## Verification

- Unit/integration suite, lint, TypeScript, and production build.
- Production browser smoke checks run with provider credentials disabled.
- Separate desktop/mobile UI checks render the actual components with mock server data; no real emails, payments, or orders are created.
- Visual review and overflow checks at 320, 390, and 1440 pixels.

Run `npm run test:ui` for the isolated component flows. Run `npm run build` then
`npm run test:e2e` for the production smoke checks. Existing hosted provider
acceptance checks in HANDOFF.md remain necessary before launch.
