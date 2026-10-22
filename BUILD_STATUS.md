# MEDIMATE: Build status

Status labels follow `MEDIMATE_Claude_Code_Kit/MEDIMATE_EXECUTION.md` §1. Last updated: 2026-10-22.

## Checks (real results)

| Check | Command | Result (2026-10-22) |
|---|---|---|
| Shared unit tests (SMS parser, USSD machine, freshness, entitlements, time zones, units, CSV, phone, adherence) | `npm test -w shared` | 66 passed |
| Server integration tests (PGlite in-memory, fake clock) + Vercel path restore | `npm test -w server` | 35 passed (4 files) |
| Type check | `npm run typecheck` (shared, server, web) | passes |
| Lint | `npx eslint .` | passes (exit 0) |
| Production build | `npm run build` (server bundle + Vite) | passes |
| Vercel build output | `node scripts/vercel-build.mjs` (no `DATABASE_URL`) | passes; function bundle 2.0 MB; smoke test of the bundled function: `/api?__path=health` 200, `/api/health` 200, OpenAPI 200 |
| Mobile layout | Browser preview at 375 px: Find, pharmacy detail, medicines, simulator (SMS + USSD), dashboard, reminders, medicines, health, steps, water, progress, history, checkups, caretakers, messages, billing, settings, caretaker view, pharmacy portal (overview, stock), admin (all pages) | no horizontal overflow (`scrollWidth` 375 on every page), no console errors after fixes; desktop checked for Find and Readings |
| Playwright E2E / axe | n/a | **Not implemented** |

## Phases

| Phase | State |
|---|---|
| 0 Audit | Done. |
| 1 Foundation & design system | Implemented + tested. Mobile-first pass finished on all screens: grouped list rows, no card grids or stat tiles, stacked rows instead of tables, section tab bar on phones in the pharmacy and admin areas. |
| 2 Auth, roles, consent, audit | Implemented + tested. Phone OTP, Firebase email + Google (server verifies ID tokens with Google JWKS; forged token rejected locally), account linking, roles, consent history, DB-enforced append-only audit log. |
| 3 Medicines & pharmacy discovery | Implemented + tested. |
| 4 SMS parser & simulator | Implemented + tested. Twilio adapter (outbound + signed inbound webhook) implemented and unit-tested; Africa's Talking implemented, not verified. |
| 5 USSD state machine & simulator | Implemented + tested. Live gateway: production gate. |
| 6 Reminders, checkups, escalation | Implemented + tested. |
| 7 Vitals, steps, water, reactions, history | Implemented + tested. |
| 8 Pharmacy & caretaker portals | Implemented + tested. |
| 9 Subscription, admin, localisation | Implemented + tested (demo checkout); Fapshi adapter implemented + unit-tested with a mocked API. |
| 10 Hardening & handoff | README and `docs/` written; Vercel Build Output script done; deployment in progress (see below). E2E: not implemented. |

## Integrations

| Integration | State |
|---|---|
| Firebase | Project `medimate-she-codes` created (Analytics off, Gemini off); Email/Password and Google enabled; Web app registered; `localhost` authorized. Config in local `.env`. **Email and Google sign-in not yet tested end to end** (needs the owner's own account; Claude does not create accounts on third-party providers). Vercel domain still to be authorized. |
| SMS | Simulator locally. Twilio: **Blocked** until the owner signs in to the Twilio console (session had expired) and pastes the Auth Token. |
| USSD | Simulated. Live gateway: production gate. |
| Payments | Demo checkout locally. Fapshi sandbox: **Blocked** until the owner signs in to the Fapshi dashboard (session had expired) so the `apiuser` can be read. |
| Database | PGlite locally; Neon via Vercel Storage pending. |
| Vercel | **Blocked**: the in-app browser is not signed in to Vercel; signing up / authorizing GitHub is for the owner. |

## Known issues found and fixed in this pass

- Simulator and message thread crashed in current Chromium: effects returned the Promise from `scrollIntoView`. Fixed; they now scroll the message box only.
- Page grids overflowed at 375 px when a chip row was wider than the screen. Fixed with shrinkable grid columns.
- History timeline showed raw reading keys (`bp`, `glucose`). Fixed.
- Root `npm run build` called a non-existent `shared` build. Fixed.
- Local PGlite database was half-migrated (tables without a migration record). Moved aside to `server/.data/pglite.bak-202610220249` and recreated.

## Open work

1. Owner sign-ins: Vercel (in-app browser, GitHub `bihlesly-2`), Fapshi dashboard (in-app browser), Twilio console (Chrome).
2. Deploy to Vercel with Neon; set env vars (owner pastes secrets); authorize the Vercel domain in Firebase; Fapshi webhook URL.
3. Test on the live URL: landing, find + pharmacy detail, phone login 600000001, Taken, simulator SMS/USSD, email login.
4. Playwright journeys + axe checks.

## Production gates (not solved by code)

Legal/privacy review, clinical review of all medicine/tip/safety copy and emergency guidance, real pharmacy verification, telecom provisioning (sender ID, short code, USSD code), security review, accessibility testing with users, payment terms. See [docs/SECURITY.md](docs/SECURITY.md) and the spec §13.
