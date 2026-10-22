# MEDIMATE: Build status

Status labels follow `MEDIMATE_Claude_Code_Kit/MEDIMATE_EXECUTION.md` §1. Last updated: 2026-10-22.

## Checks (real results)

| Check | Command | Result (2026-10-22) |
|---|---|---|
| Shared unit tests (SMS parser, USSD machine, freshness, entitlements, time zones, units, CSV, phone, adherence) | `npm test -w shared` | 66 passed |
| Server integration tests (PGlite in-memory, fake clock) + Vercel path restore | `npm test -w server` | 43 passed (6 files: incl. push notifications, nudges, assistant route) |
| Type check | `npm run typecheck` (shared, server, web) | passes |
| Lint | `npx eslint .` | passes (exit 0) |
| Production build | `npm run build` (server bundle + Vite) | passes |
| Vercel build output | `node scripts/vercel-build.mjs` (no `DATABASE_URL`) | passes; function bundle 2.0 MB; smoke test of the bundled function: `/api?__path=health` 200, `/api/health` 200, OpenAPI 200 |
| Mobile layout | Browser preview at 375 px: Find, pharmacy detail, medicines, simulator (SMS + USSD), dashboard, reminders, medicines, health, steps, water, progress, history, checkups, caretakers, messages, billing, settings, caretaker view, pharmacy portal (overview, stock), admin (all pages) | no horizontal overflow (`scrollWidth` 375 on every page), no console errors after fixes; desktop checked for Find and Readings |
| Playwright E2E / axe | n/a | **Not implemented** |

## Live deployment (2026-10-22)

https://medimate-she-codes.vercel.app (Vercel Hobby, Neon Postgres). Checked live: `/api/health` ok with database; config shows demo mode, Firebase, Fapshi sandbox, SMS simulator; search returns 4 results; phone login with demo 600000001 reaches the dashboard at 375 px; water log 201; SMS simulator `WATER 2 GLASSES` replies; USSD home menu opens. Email/Google buttons show (not signed in with a real account yet). Taken not tested live: Ama's first reminder (08:00 WAT) was not due yet. Fapshi sandbox checkout tested locally only.

The repo is now public, which unblocked Vercel deploys of later commits. **Not yet checked live** after the redesign: push notifications, the new Find screen (distance, minutes, directions), the Me hub, onboarding, the Today path and the assistant. Migration `0002_notifications` runs during the Vercel build.

Fapshi: sandbox webhook URL set; webhook secret not yet set on Fapshi (webhooks get 401; payments still settle by status polling). Twilio: trial expired and unavailable in Cameroon; needs a paid upgrade.

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

## New in the app redesign (2026-10-22)

| Feature | State |
|---|---|
| App-style UI: splash, welcome, onboarding, Today path, 3D components, Me hub (no hamburger) | Implemented; typecheck, lint and build pass; checked locally in the browser preview. |
| Find: type a medicine, get pharmacies with price, distance, estimated walk and taxi minutes, Google Maps directions, Call | Implemented. Minutes are estimates (straight-line distance x 1.3, 4.8 km/h walking, 20 km/h taxi + 2 min), labelled as such. Not yet previewed at 375 px. |
| Pop-up reminders (Web Push, VAPID), notification inbox, welcome message, water/steps nudges | Implemented + tested with a fake push sender. Live: needs `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` on Vercel. Vercel Hobby cron runs once a day; the 5-minute engine needs the GitHub Actions workflow in `docs/github/reminder-engine.yml` added by the owner (the push token lacks `workflow` scope) plus a `CRON_SECRET` repo secret. |
| Ask MEDIMATE assistant (Claude Haiku, `claude-haiku-5-5`): logs water, steps, readings, answers reminders, finds medicines, messages caretakers; voice input where the browser supports it | Implemented. Route tests cover auth, validation and the not-configured state; the model loop itself is **not tested against the live API**. Off until `ANTHROPIC_API_KEY` is set. |
| WhatsApp assistant | Not started. Planned route: Meta WhatsApp Cloud API (free tier for service conversations). |
| Steps from phone or watch | Not started. Needs a native wrapper (Capacitor + Health Connect / HealthKit) or Fitbit OAuth; manual entry today. |

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

1. Owner adds on Vercel: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (from `.env.vercel.local`), `ANTHROPIC_API_KEY`; redeploy.
2. Owner adds the GitHub Actions workflow from `docs/github/reminder-engine.yml` and the `CRON_SECRET` repo secret.
3. Owner sets the webhook secret on the Fapshi sandbox page.
4. Test on the live URL: push on an Android phone, Find with location, onboarding, Today path, assistant, email and Google login with the owner's account.
5. Playwright journeys + axe checks.

## Production gates (not solved by code)

Legal/privacy review, clinical review of all medicine/tip/safety copy and emergency guidance, real pharmacy verification, telecom provisioning (sender ID, short code, USSD code), security review, accessibility testing with users, payment terms. See [docs/SECURITY.md](docs/SECURITY.md) and the spec §13.
