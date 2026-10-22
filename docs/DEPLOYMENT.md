# Deployment

Two supported shapes: **Vercel** (the hackathon demo) and a **long-running Node server** (container or VM). Both need PostgreSQL in production.

## Vercel

### How the build works

`vercel.json` runs `npm ci` and `npm run vercel-build`, which runs [`scripts/vercel-build.mjs`](../scripts/vercel-build.mjs). It writes the [Build Output API v3](https://vercel.com/docs/build-output-api/v3) to `.vercel/output`:

| Output | Content |
|---|---|
| `static/` | The Vite build of `web/`. |
| `functions/api.func/` | The Express API bundled by esbuild into one ESM file (`index.mjs`, Node.js 22). PGlite is left out; production uses `DATABASE_URL`. |
| `config.json` | Routes: `/api/*` to the function, then static files, then the SPA fallback to `index.html`. Security headers and CSP on every response, `immutable` caching for `/assets/*`, `no-cache` for `index.html` and `sw.js`. One daily cron: `GET /api/cron/tick` at 06:00 UTC. |

When `DATABASE_URL` is present at build time, the build applies migrations and seeds the fictional demo data **only if the database has no users** (`seed-cli --if-empty`). Cold starts never migrate or seed.

The route sends `/api/<path>` to the function as `/api?__path=<path>`; the entry ([`server/src/vercel.ts`](../server/src/vercel.ts)) restores `/api/<path>` and the original query before Express sees it, whether the platform passes the original or the rewritten URL (unit-tested).

### Content Security Policy

`default-src 'self'`; scripts from self plus `apis.google.com` and `www.gstatic.com` (Google sign-in); styles self plus inline (React style attributes and Leaflet); images self, `data:` and `*.tile.openstreetmap.org`; connections to self, `*.googleapis.com` and `*.firebaseapp.com`; frames only `*.firebaseapp.com`, `accounts.google.com`, `apis.google.com`; `frame-ancestors 'none'`. `Cross-Origin-Opener-Policy: same-origin-allow-popups` keeps the Google popup working.

### Steps

1. Import the GitHub repository on vercel.com/new. Framework preset: **Other** (the repo's `vercel.json` sets the commands). Root directory: the repository root.
2. Storage: add a **Neon** Postgres database and connect it to the project, so `DATABASE_URL` is injected for Production, Preview and Development.
3. Environment variables (Production):

   | Name | Value | Secret? |
   |---|---|---|
   | `NODE_ENV` | `production` | no |
   | `PUBLIC_DEMO` | `true` (fictional demo site) | no |
   | `DEMO_MODE` | `true` | no |
   | `OTP_PROVIDER` | `dev` (codes on screen only for fictional numbers) | no |
   | `SCHEDULER_INTERVAL_SECONDS` | `0` | no |
   | `APP_ORIGIN` | `https://<your-domain>` | no |
   | `APP_SECRET` | 32+ random characters | **yes** |
   | `CRON_SECRET` | random string | **yes** |
   | `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID` | from the Firebase web app | no (public by design) |
   | `MESSAGING_PROVIDER` | `simulator`, or `twilio` | no |
   | `TWILIO_ACCOUNT_SID`, `TWILIO_FROM` | from Twilio | no |
   | `TWILIO_AUTH_TOKEN` | from Twilio | **yes** |
   | `PAYMENTS_PROVIDER` | `demo`, or `fapshi` | no |
   | `FAPSHI_ENV`, `FAPSHI_API_USER` | `sandbox`, apiuser | no |
   | `FAPSHI_API_KEY`, `FAPSHI_WEBHOOK_SECRET` | from Fapshi / chosen | **yes** |

   Generate secrets locally:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

4. Deploy. Check `https://<your-domain>/api/health` returns `{"status":"ok","database":"ok"}`.
5. Firebase: add `<your-domain>` to Authentication, Settings, Authorized domains.
6. Fapshi: webhook URL `https://<your-domain>/api/billing/fapshi/webhook` with the same `FAPSHI_WEBHOOK_SECRET`.
7. Twilio (optional inbound SMS): the number's messaging webhook `https://<your-domain>/api/sms/twilio`.

Vercel sends `Authorization: Bearer $CRON_SECRET` to cron paths when `CRON_SECRET` is set; without it the cron endpoint answers 404.

### Limits on the Hobby plan

- Cron runs at most once per day, so reminders are sent between cron runs only when someone opens their reminders or uses the simulator. See [REMINDERS.md](REMINDERS.md).
- Functions are stateless: the 30-second tick throttle and rate-limit counters are per instance.
- The demo database is reseeded only when empty. To reset it, truncate the tables (or create a new Neon branch) and redeploy.

## Long-running server (container or VM)

```bash
npm ci
npm run build                     # server/dist and web/dist
DATABASE_URL=postgres://... npm run db:migrate
npm start                         # API on $PORT with the in-process reminder scheduler
```

Serve `web/dist` as static files with an SPA fallback to `index.html`, and proxy `/api` to the API. Put the CSP and security headers from `scripts/vercel-build.mjs` on the static responses. Use `docker-compose.yml` for a local Postgres if needed.

## Configuration safety

`server/src/config.ts` refuses to start in production when: `APP_SECRET` is missing, short or a dev value; `DATABASE_URL` is missing; or, outside `PUBLIC_DEMO`, when demo mode, on-screen OTP, the SMS simulator or the demo checkout are on, or `INBOUND_WEBHOOK_SECRET` is missing. Provider settings are validated as a set (for example Twilio needs SID, token and sender).
