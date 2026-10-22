# API

The REST API lives under `/api`. The machine-readable description is served by the API itself:

- Local: <http://localhost:3001/api/docs/openapi.json>
- Deployed: `https://<your-domain>/api/docs/openapi.json`

It is generated from [`server/src/openapi.ts`](../server/src/openapi.ts), which names the Zod schema in [`shared/src/schemas.ts`](../shared/src/schemas.ts) that validates each request body. Load it into any OpenAPI viewer (for example Swagger Editor) to browse it.

## Conventions

- **JSON in, JSON out.** Requests are validated with the shared Zod schemas; unknown fields are ignored (stripped), never stored.
- **Errors** always have the same shape, never a stack trace:

  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Plain-language message", "details": { "field": "why" }, "requestId": "..." } }
  ```

  Codes the web app reacts to: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND`, `PREMIUM_REQUIRED` (trial ended), `CONSENT_REQUIRED` (health-data consent missing), `RATE_LIMITED` (429).
- **Request IDs.** Every response carries `x-request-id`; send your own (8 to 64 word characters) to correlate logs.
- **Sessions.** Signing in sets the `mm_session` cookie (`httpOnly`, `SameSite=Lax`, `Secure` in production). Browser clients use `credentials: 'same-origin'`.
- **CSRF.** POST, PUT, PATCH and DELETE must carry an `Origin` that matches the site (or one listed in `APP_ORIGIN`). Provider webhooks and the cron endpoint are exempt and use secrets instead.
- **Caching.** All `/api` responses are `Cache-Control: no-store`.
- **Rate limits** (per IP): 600 requests/min overall; `/auth/otp` 20 per 10 min (plus 3 codes per number per 15 min); `/inquiries` 120/h; `/reports` 20/h; `/sim` 120/min.

## Access levels

| Label in the spec | Meaning |
|---|---|
| `public` | No sign-in. |
| `session` | Any signed-in person. Object ownership is checked in the service. |
| `patient+premium` | Signed in, inside the trial or Premium, and (for health data) `health_data` consent granted. Enforced on the server. |
| `caretaker-link` | Signed in and holding an **active** link; each category is checked on every request. |
| `pharmacy` | Staff of that pharmacy only (tenant isolation). |
| `reviewer` / `admin` | Role check plus audit logging of sensitive actions. Reviewer cannot approve content they submitted. |
| `webhook-secret` | `x-medimate-webhook-secret` header (generic gateway), `x-wh-secret` (Fapshi), or `X-Twilio-Signature` (Twilio). |
| `cron-secret` | `Authorization: Bearer $CRON_SECRET`. Returns 404 when `CRON_SECRET` is unset. |
| `demo-only` | Exists only when `DEMO_MODE=true`. On the public demo the simulator accepts only fictional `+237 600` numbers. |

## Endpoint groups

| Group | Main routes |
|---|---|
| System | `GET /health`, `GET /config`, `GET /docs/openapi.json`, `GET /cron/tick` |
| Auth | `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/firebase`, `POST /auth/logout`, `GET /auth/me`, `POST /me/link/email`, `POST /me/link/phone/request`, `POST /me/link/phone/verify` |
| Account | `GET/PATCH /me/profile`, `GET/POST /me/consents`, `GET /me/export`, `DELETE /me` |
| Pharmacies and medicines | `GET /pharmacies/search`, `GET /pharmacies`, `GET /pharmacies/{id}`, `GET /medicines`, `GET /medicines/{id}`, `GET /tips`, `POST /reports` |
| Reminders | `/plans`, `/reminders` (+ `/confirm`, `/correct`), `/checkups`, `/adherence` |
| Tracking and history | `/vitals`, `/vitals/overview`, `/steps`, `/water`, `/progress`, `/reactions`, `/history`, `/history/export.pdf` |
| Caretakers | `/care/links` (patient side), `/caretaker/invites`, `/caretaker/patients` |
| Inquiries | `/inquiries`, `/inquiries/{id}/messages`, `/inquiries/{id}/close` |
| Pharmacy portal | `/pharmacy/register`, `/pharmacy/profile`, `/pharmacy/verification`, `/pharmacy/stock`, `/pharmacy/stock/import`, `/pharmacy/inbox`, `/pharmacy/analytics` |
| Admin | `/admin/overview`, `/admin/pharmacies`, `/admin/medicines`, `/admin/tips`, `/admin/reports`, `/admin/users`, `/admin/settings`, `/admin/sms-logs`, `/admin/ussd-sessions`, `/admin/audit` |
| Billing | `GET /me/subscription`, `POST /me/checkout`, `GET /me/payments/{id}`, `POST /me/payments/{id}/demo-confirm`, `POST /billing/fapshi/webhook` |
| Channels | `POST /sms/twilio`, `POST /sms/inbound`, `POST /ussd/africastalking` |
| Simulator (demo) | `POST /sim/sms`, `GET /sim/sms/thread`, `POST /sim/ussd`, `POST /sim/reset`, `POST /sim/tick` |

## Examples

Search (public):

```bash
curl "http://localhost:3001/api/pharmacies/search?q=paracetamol%20500&area=Molyko&sort=price"
```

Each result has the pharmacy, the medicine label, `price`, `stockState`, `updatedAt`, `ageLabel`, `stale` and `lowest`. Stale reports (over 48 hours) are hidden unless `includeStale=true`, and are never marked lowest.

Phone sign-in (local demo, fictional number):

```bash
curl -c jar -H "content-type: application/json" -H "origin: http://localhost:5173" \
  -d '{"phone":"600000001"}' http://localhost:3001/api/auth/otp/request
# {"message":"...","devCode":"123456"}   devCode appears only for fictional numbers or the simulator
curl -c jar -b jar -H "content-type: application/json" -H "origin: http://localhost:5173" \
  -d '{"phone":"600000001","code":"123456"}' http://localhost:3001/api/auth/otp/verify
```

Confirm a reminder (idempotent; repeating the same key returns `"result":"already"`):

```bash
curl -b jar -H "content-type: application/json" -H "origin: http://localhost:5173" \
  -d '{"action":"taken","idempotencyKey":"<occurrence-id>:web"}' \
  http://localhost:3001/api/reminders/<occurrence-id>/confirm
```
