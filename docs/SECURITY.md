# Security and production readiness

This is a hackathon build. The code implements the controls below and they are tested where noted, but **MEDIMATE has not had an independent security review, legal or privacy review, or clinical review, and must not be used with real patients** until the production gates at the end are closed. Nothing here claims compliance with any law or standard.

## What we protect

| Asset | Why it matters |
|---|---|
| Health data: medicine plans, reminder answers, readings, reactions, checkups | Sensitive personal data; disclosure can cause harm and stigma. |
| Identity: phone numbers, emails, sessions, OTP codes | Account takeover gives access to the above. |
| Trust data: pharmacy verification, stock and prices, medicine information | Wrong or forged data can send people to the wrong place or the wrong medicine. |
| Payments | Premium time must match real, confirmed payments. |

## Threats and controls

| Threat | Controls in this build | Evidence |
|---|---|---|
| Account enumeration | OTP request returns the same response for every number; generic failure messages. | `server/test/api.test.ts` |
| OTP brute force or SMS pumping | 6-digit codes, HMAC-hashed with `APP_SECRET`, 5 min expiry, 5 attempts, 3 codes per number per 15 min, IP rate limit; codes never logged or stored in SMS logs. Fictional numbers never trigger real SMS. | code review, tests |
| Session theft | Random 32-byte token in an `httpOnly`, `SameSite=Lax`, `Secure` cookie; only its SHA-256 stored; 7-day expiry; HSTS on Vercel. | code |
| CSRF | Origin check on every state-changing request; webhooks exempt but authenticated. | tests |
| XSS | React escaping; no `dangerouslySetInnerHTML` for user content; strict CSP on the deployed site (`script-src 'self'` plus Google sign-in hosts, `frame-ancestors 'none'`). | build config |
| Cross-user access (IDOR) | Every query scoped by the signed-in user; ownership checked in services, not only roles. | tests for cross-user reads |
| Pharmacy tenant leakage | Staff see only their own pharmacy's stock, inbox and analytics; never patient health records. | tests |
| Caretaker over-reach | Per-category consent, checked on every request; revocation takes effect on the next request; alerts are generic unless the patient allows detail. | tests (grant, read one category, revoke, denied) |
| Firebase token forgery or email takeover | ID tokens verified (RS256, Google JWKS, issuer, audience, expiry). Existing accounts matched by email only when Firebase says the email is verified. | code, local check with a forged token |
| Forged payment confirmation | Webhook `x-wh-secret` check; status always re-queried from Fapshi; idempotent fulfilment. | code, tests for the demo path |
| Forged SMS or USSD webhooks | Twilio `X-Twilio-Signature` (HMAC-SHA1); generic gateways need `x-medimate-webhook-secret`. | signature unit test |
| Duplicate or replayed actions | Unique dedupe keys on reminders, idempotency keys on confirmations, conditional updates everywhere state changes. | tests |
| Tampering with history | Append-only audit log enforced by a database trigger; consent history is append-only. | migration `0001_audit_append_only.sql`, test |
| Clinical harm from content | No diagnosis, no dose calculation, no normal/abnormal labels; medicine text shown only when a second person verified it with a source; tips published only after review by someone other than the author. | tests, UI copy |
| Stale or fake pharmacy data | Only admin-approved pharmacies with a valid date appear; reports older than 48 h flagged and excluded from "lowest price"; report-a-problem flow. | tests |
| Shared phones (USSD) | Sessions time out after 120 s; a new session never resumes the previous screen. | tests |
| Data minimisation in SMS and logs | Generic reminder SMS; SMS bodies purged after 7 days; phone numbers masked in admin lists and logs; structured logs without bodies. | code |
| Denial of service | Per-IP rate limits, request size limits (600 kB JSON), bounded pagination. Vercel's platform limits in front. | code |
| Secrets in source | `.env` git-ignored; `.env.example` has placeholders only; production refuses dev secrets. | `config.ts` |
| Misconfigured production | Startup fails if demo mode, on-screen OTP, the SMS simulator or the test checkout are on in production without `PUBLIC_DEMO`, or if `APP_SECRET` or `DATABASE_URL` are missing. | `config.ts` |

## Known gaps (not done in this build)

- No application-level field encryption; health data relies on database storage encryption (Neon encrypts at rest). Key management and rotation are not designed.
- No MFA for admin, reviewer or pharmacy accounts.
- Rate limits are in-memory per instance; on serverless they are weaker. A shared store (Redis/Upstash) is needed for strict limits.
- No malware scanning; pharmacy verification documents are references, not uploads.
- No automated dependency or secret scanning in CI yet; no Playwright or axe suite yet.
- The public demo shows OTP codes on screen for fictional numbers by design. It must never hold real health data.

## Production gates (from the specification, section 13)

These are responsibilities of the operator. Code alone does not close them.

- [ ] Legal entity, operating geography, target jurisdictions, data controller and processor roles, and applicable health, privacy and telecom rules confirmed with qualified counsel.
- [ ] Privacy notices, consent wording, retention and deletion policy, data-subject workflows, cross-border processing (Vercel, Neon, Firebase, Twilio, Fapshi are outside Cameroon) and vendor contracts reviewed.
- [ ] Medicine content, wellness tips, any ranges, emergency instructions and all safety copy reviewed by qualified local clinicians and pharmacists. All current content is fictional demo text.
- [ ] Pharmacies and medicines verified against valid authoritative sources, with a repeatable re-verification process. All current pharmacies are fictional.
- [ ] Real SMS and USSD provisioned and tested: sender ID or short code, USSD code, templates, delivery receipts, STOP handling, throughput, cost, and provider incident behaviour.
- [ ] Secrets in a managed store, TLS, database encryption, backups and tested restores, key management, monitoring and alerts, log retention and redaction, least-privilege access to Vercel, Neon, Firebase, Twilio and Fapshi, and an incident response plan.
- [ ] Independent security review or penetration test appropriate to the risk.
- [ ] Accessibility testing with representative users and assistive technologies.
- [ ] Trial and payment terms confirmed; live Fapshi service approved; test checkout removed from production.
- [ ] Escalation policy, shared-phone privacy, consent revocation, deletion limits and safe messaging tested with representative local scenarios.

## Reporting a problem

Please report security issues privately to the repository owners rather than opening a public issue.
