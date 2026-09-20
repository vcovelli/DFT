# Done For Teachers

Next.js App Router, TypeScript, and Tailwind marketing site with Phase 2 ordering
and minimal owner operations. The existing Phase 1 design is preserved.

The implementation includes Postgres orders and immutable pricing, private PDF
uploads, Stripe deposits and balance invoices, signed webhook reconciliation,
Resend notifications, Supabase owner sign-in, fulfillment/settings/recovery screens,
and managed maintenance. **Ordering defaults to paused. Provider setup, approved
business policies, and staging acceptance are required before production launch.**
No production deployment, live payments, or DNS changes have been performed.

## Local development

Node 22; `npm ci`; configure ignored `.env.local` using `.env.example` and the setup
guide; `npm run db:migrate`; `npm run dev`. The homepage remains available with
ordering paused when services are unconfigured. Owner tools are at `/owner`.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Unit/workflow tests use a PostgreSQL engine in-process and mocked external APIs;
they never charge cards or contact real customers. Browser smoke tests exercise the
unconfigured, closed-to-orders build. They do not replace provider acceptance tests.

## Guides

- [Repository audit and architecture](docs/AUDIT.md)
- [Account setup, migrations, Stripe, email, storage, and deployment](docs/SETUP.md)
- [Nontechnical owner operating guide](docs/OWNER-GUIDE.md)
- [Reliability, backups, recovery, deletion, and rollback](docs/OPERATIONS.md)
- [Launch acceptance and handoff checklist](docs/HANDOFF.md)
- [Actual validation results and limits](docs/VALIDATION.md)

Production infrastructure and customer data must belong to the business owner.
Manual delivery is performed by the owner after verified final payment. Templates
are one PDF up to 3 MB; no customer accounts or automatic document delivery are built.
