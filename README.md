<p align="center"><img src="web/public/brand/medimate-mark.png" width="72" alt="MEDIMATE logo" /></p>

<h1 align="center">MEDIMATE</h1>
<p align="center"><em>Track • Remind • Live Healthier</em></p>

MEDIMATE helps people in Buea, Cameroon find a verified pharmacy, see what medicine it last reported and at what price, get reminders for the prescription they already have, and keep a simple health log to show their health worker. It works on a smartphone **and on a basic phone by SMS or USSD**, with the same account.

Built for the **She Codes hackathon**.

> **Demo build.** All pharmacies, people, prices and medicine texts are fictional. SMS and USSD run in a browser simulator unless a real SMS provider is configured, and payments use a labelled test checkout or the Fapshi **sandbox**. MEDIMATE does not diagnose, prescribe or replace a pharmacist or health worker. See [What is real and what is simulated](#what-is-real-and-what-is-simulated).

**Live demo:** see the deployment link in the repository description, or deploy your own with [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Features

**For everyone (always free)**
- Find admin-verified pharmacies by medicine and area; list and map (OpenStreetMap) views; call or message the pharmacy.
- Stock shown as "last reported" with its age. Reports over 48 hours old are flagged and never count as the lowest price; "lowest listed price" compares only the same medicine, strength and form.
- Medicine pages show information only after a second person reviewed it against a recorded source; otherwise they say so plainly.

**For patients (30-day trial, then Premium)**
- Medicines entered exactly as prescribed; reminders by app and generic SMS; answer with Taken or Skip on the web, by SMS (`TAKEN`) or USSD. Each answer is recorded once.
- Follow-up, and an optional alert to a caretaker the patient chose, only for the categories they shared.
- Checkups, readings (blood pressure, glucose, weight, height, heart rate, temperature) shown neutrally, steps, water, reactions, streaks without shaming, and a PDF summary for a clinician.

**For caretakers, pharmacies and admins**
- Caretakers see only what each person shares, revocable at once.
- Pharmacy portal: stock and prices, CSV import with preview, inquiry inbox, opening hours, verification, analytics from real events.
- Admin and reviewer: pharmacy verification, medicine and tip review (reviewer must differ from the author), reports, users and roles, trial and price settings, SMS/USSD logs, append-only audit log.

**Feature phones**
- SMS commands: `JOIN`, `FIND`, `PRICE`, `INFO`, `CONTACT`, `TAKEN`, `SKIP`, `BP`, `SUGAR`, `WEIGHT`, `WATER`, `STEPS`, `LANG`, `HELP`, `MORE`, `STOP`, `START`.
- USSD menu (`*123#` placeholder): find medicine, reminders, log health, contact pharmacy, tips, account. Back (`0`), Home (`00`), timeouts that never reveal the previous screen.

## Quick start

Requirements: Node.js 20.19 or newer (22 or 24 recommended) and npm. No database install needed.

```bash
git clone https://github.com/bihlesly-2/Medimate-She-Codes-Hackathon.git
cd Medimate-She-Codes-Hackathon
npm install
cp .env.example .env        # optional: the app runs with no .env at all
npm run dev                 # API on http://localhost:3001, web on http://localhost:5173
```

Open <http://localhost:5173>. On first start the API creates an embedded PostgreSQL database (PGlite, in `server/.data/pglite`), applies migrations and seeds fictional demo data.

Reset the demo data at any time:

```bash
npm run db:seed
```

To use a real PostgreSQL server instead, start one (`docker compose up -d postgres`) and set `DATABASE_URL=postgres://medimate:medimate@localhost:5432/medimate` in `.env`.

## Demo accounts

Sign in with **Phone code**, type the number, press "Send me a code"; for these fictional numbers the code appears on screen.

| Number | Who | Try |
|---|---|---|
| 600 000 001 | Ama, patient, active trial | Dashboard, Taken/Skip, readings, history PDF |
| 600 000 002 | Ben, trial ended | Premium locked, finder still free, test checkout |
| 600 000 003 | Clara, caretaker for Ama | People I care for |
| 600 000 004 | Dan, pharmacist at Demo Pharmacy Molyko | Stock, CSV import, inquiries |
| 600 000 005 | Eve, admin | Verification, reports, settings, audit |
| 600 000 006 | Femi, clinical reviewer | Medicine and tip review |
| 600 000 007 | Gina, pharmacist at Demo Pharmacy Great Soppo | Tenant isolation |

Email and Google sign-in appear when the `FIREBASE_*` settings are present ([docs/AUTH.md](docs/AUTH.md)).

## SMS and USSD simulator

Open **Try SMS and USSD** (`/simulator`). Pick a number (for example Ama, `600000001`), then:

- SMS: send `HELP`, `FIND paracetamol, Molyko`, `PRICE amoxicillin`, `INFO paracetamol 500`, `WATER 2 GLASSES`, `STEPS 4500`, `BP 120/80`, or run a scripted journey. Press **Run reminder engine now**, then send `TAKEN` and watch the web dashboard update.
- USSD: press **Dial**, then `1` to find a medicine, `0` Back, `00` Home, or **Simulate timeout**.

Everything uses the real command engine and database; nothing reaches a real phone. Details: [docs/SMS_USSD.md](docs/SMS_USSD.md).

## Configuration

All settings are environment variables; [`.env.example`](.env.example) documents each one with safe placeholders. The important groups:

| Group | Variables | Default behaviour |
|---|---|---|
| Core | `NODE_ENV`, `PORT`, `APP_ORIGIN`, `APP_SECRET` | Development values |
| Database | `DATABASE_URL`, `PGLITE_DIR` | Embedded PGlite |
| Demo | `DEMO_MODE`, `PUBLIC_DEMO` | Demo banner and simulator on |
| Sign-in | `OTP_PROVIDER`, `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID` | Phone codes; email/Google hidden without Firebase |
| SMS | `MESSAGING_PROVIDER`, `TWILIO_*`, `AT_*`, `INBOUND_WEBHOOK_SECRET` | Simulator, nothing sent |
| Payments | `PAYMENTS_PROVIDER`, `FAPSHI_ENV`, `FAPSHI_API_USER`, `FAPSHI_API_KEY`, `FAPSHI_WEBHOOK_SECRET` | Test checkout, no money |
| Reminders | `REMINDER_*_MINUTES`, `SCHEDULER_INTERVAL_SECONDS`, `CRON_SECRET` | 30/60/180 min, tick every 30 s |

Never commit `.env`. In production the server refuses to start with development secrets or with demo features on (unless it is the labelled public demo).

## Tests and checks

```bash
npm run typecheck     # shared, server, web
npx eslint .          # lint
npm test              # shared unit tests (66) and server integration tests (35), PGlite in memory, fake clock
npm run build         # server bundle and web build
npm run check         # all of the above
```

Current results are recorded in [BUILD_STATUS.md](BUILD_STATUS.md).

## Deploy

Vercel, with Neon Postgres, Firebase, Twilio and Fapshi: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). `npm run vercel-build` produces the Build Output API v3 locally so you can inspect it.

## What is real and what is simulated

| Area | State |
|---|---|
| Web app, API, database, reminder engine, SMS command engine, USSD state machine | Real, tested |
| Pharmacies, people, prices, medicine texts, health tips | **Fictional demo data** |
| Phone sign-in | Real codes by SMS for real numbers when an SMS provider is set; on-screen codes only for fictional numbers |
| Email and Google sign-in | Real Firebase Authentication when configured |
| Outbound SMS | Twilio when configured (trial accounts reach only verified numbers); otherwise simulated |
| USSD on a real network | Not provisioned; browser simulator only |
| Payments | Test checkout, or Fapshi **sandbox** (no real money) |
| Clinical review, pharmacy verification, legal review | **Not done**: production gates |

## Documentation

| Doc | Contents |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Packages, boundaries, runtime shapes |
| [API](docs/API.md) | Conventions, access levels, endpoints, OpenAPI at `/api/docs/openapi.json` |
| [DATA_MODEL](docs/DATA_MODEL.md) | Tables and ER diagram |
| [SMS_USSD](docs/SMS_USSD.md) | Commands, menus, providers, simulator |
| [REMINDERS](docs/REMINDERS.md) | Engine, idempotency, escalation, where it runs |
| [AUTH](docs/AUTH.md) | Phone OTP, Firebase email/Google, linking, sessions, roles |
| [PAYMENTS_FAPSHI](docs/PAYMENTS_FAPSHI.md) | Trial, Premium, Fapshi flow, sandbox numbers |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Vercel and container deploys, env vars |
| [DESIGN](docs/DESIGN.md) | Mobile-first rules and why |
| [SECURITY](docs/SECURITY.md) | Threat model, gaps, production gates |

## Project layout

```
shared/   Zod schemas, SMS parser, USSD machine, freshness, entitlements, units, time zones
server/   Express API, Drizzle schema and migrations, providers, services, tests
web/      React app (pages, components, i18n, PWA shell)
scripts/  vercel-build.mjs (Build Output API v3)
docs/     documentation
```

## Safety

MEDIMATE stores and repeats what a prescriber wrote. It never diagnoses, never suggests or changes a dose, and never labels a reading normal or abnormal. Medicine information and health tips are shown only after review, with their source. If you are worried about your health, contact a qualified health professional.
