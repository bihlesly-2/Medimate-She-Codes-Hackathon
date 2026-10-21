# MEDIMATE — Build status

Status labels follow `MEDIMATE_Claude_Code_Kit/MEDIMATE_EXECUTION.md` §1. Last updated: 2026-10-21.

## Checks (real results)

| Check | Command | Result |
|---|---|---|
| Shared unit tests (SMS parser, USSD machine, freshness, entitlements, time zones, units, CSV, phone, adherence) | `npm test -w shared` | 66 passed |
| Server integration tests (PGlite in-memory, fake clock) | `npm test -w server` | 32 passed (last full run before the email/phone-link UI work) |
| Type check | `npm run typecheck` (shared, server, web) | passes |
| Lint | `npx eslint .` | passes |
| Production build | `npm run build` | **not run yet** |
| Playwright E2E / axe | — | **Not implemented** |

## Phases

| Phase | State |
|---|---|
| 0 Audit | Done. Empty folder + spec kit + logo. Default stack chosen (React/Vite/TS, Express, Postgres). |
| 1 Foundation & design system | Implemented + tested (typecheck/lint). Tokens in `web/src/styles/index.css`, live two-tone wordmark, supplied logo cropped (not redrawn). Mobile-first redesign in progress (see "Open work"). |
| 2 Auth, roles, consent, audit | Implemented + tested. Phone OTP (dev code only for fictional numbers / simulator), Firebase email + Google sign-in (server verifies ID tokens with Google JWKS), account linking (email ↔ phone), roles, append-only consent history, DB-enforced append-only audit log. |
| 3 Medicines & pharmacy discovery | Implemented + tested. Only approved, unexpired pharmacies are public; >48 h reports hidden by default and flagged; lowest price only among comparable fresh offers; reviewer-verified medicine content with source. |
| 4 SMS parser & simulator | Implemented + tested. Provider adapters: simulator, Twilio (outbound + signed inbound webhook), Africa's Talking (implemented, not verified). |
| 5 USSD state machine & simulator | Implemented + tested (Back/Home, timeout, language, registration). AT-style webhook adapter: implemented, not verified against a live gateway. |
| 6 Reminders, checkups, escalation | Implemented + tested. DB-backed idempotent engine, bounded backoff, follow-up, consent-aware caretaker escalation, exactly-once TAKEN/SKIP. |
| 7 Vitals, steps, water, reactions, history | Implemented + tested (API). Neutral display, unit conversion, adult-only BMI, patient-only PDF export. |
| 8 Pharmacy & caretaker portals | Implemented + tested (tenant isolation, CSV preview/commit, revocation). |
| 9 Subscription, admin, localisation | Implemented + tested. Trial + server-side entitlements; demo checkout; Fapshi adapter (sandbox key present locally, `apiuser` still needed); admin queues; EN authored, FR SMS/USSD draft (unreviewed), FR/PCM web placeholders. |
| 10 Hardening & handoff | **In progress**: README/docs, Vercel build output, deployment, E2E. |

## Integrations

| Integration | State |
|---|---|
| SMS | Simulated by default. Twilio adapter ready; needs `TWILIO_*` env. Fictional +237 600… numbers are always simulated. |
| USSD | Simulated. Live gateway: production gate. |
| Payments | Demo checkout (labelled, no money). Fapshi sandbox: needs `FAPSHI_API_USER`. |
| Email login | Firebase: needs a Firebase project + `FIREBASE_*` env. |
| Database | PGlite locally; Neon/Postgres via `DATABASE_URL`. |

## Open work

See the brief of the follow-up session; summary:
1. Finish mobile-first UI pass on remaining pages and check at 375 px.
2. Vercel Build Output script, `vercel.json`, CSP headers, cron.
3. README + docs/ (architecture, API, data model ER, SMS/USSD, reminders, auth, payments, deployment, design, security).
4. Firebase project, Twilio, Fapshi credentials; Neon + Vercel deployment.
5. Playwright journeys + axe checks.

## Production gates (not solved by code)

Legal/privacy review, clinical review of all medicine/tip/safety copy and emergency guidance, real pharmacy verification, telecom provisioning (sender ID, short code, USSD code), security review, accessibility testing with users, payment terms. See `SECURITY.md` (to be written) and the spec §13.
