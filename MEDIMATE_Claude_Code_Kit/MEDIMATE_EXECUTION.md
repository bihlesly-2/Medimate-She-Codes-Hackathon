# MEDIMATE — Product & Engineering Execution Specification

**Product:** MEDIMATE  
**Tagline:** Track • Remind • Live Healthier  
**Purpose:** Inclusive pharmacy discovery, medication reminders, wellness tracking, and follow-up support across web/PWA, SMS, and USSD.  
**Document role:** This is the source of truth for product scope, design, architecture, safety, implementation order, and acceptance tests.

---

## 0. Product north star

MEDIMATE helps people—especially people in low-connectivity or low-smartphone-penetration communities—find participating pharmacies, check the freshness of reported medicine stock and prices, remember a regimen supplied by their own prescriber, and keep a simple personal health history. Smartphone users get a responsive web application/PWA. Feature-phone users must be able to access the supported critical journeys through SMS and USSD, with a browser-based simulator that makes those journeys demonstrable without a live telecom provider.

### Product principles

1. **Inclusion first:** SMS/USSD are first-class channels, not decorative add-ons.
2. **Safety first:** no diagnosis, no treatment decisions, no invented clinical authority, and no misleading claims about pharmacies or medicines.
3. **Privacy first:** collect the minimum useful data, obtain granular consent, enforce server-side access control, and minimize sensitive SMS content.
4. **Trust through provenance:** every pharmacy verification and medicine source has evidence, an actor, a date, and an audit trail.
5. **Low-bandwidth by design:** lightweight screens, progressive enhancement, resilient forms, paginated data, and offline shell where appropriate.
6. **Honest functionality:** simulated integrations and fictional sample records are visibly labelled. No pretend production behavior.
7. **Calm, human design:** reassuring and plain-spoken, never shaming people for missed reminders or broken streaks.

### Explicit non-goals

- Diagnosing disease or interpreting readings as a diagnosis.
- Recommending prescription drugs, changing prescription doses, or generating treatment plans.
- Replacing a clinician, pharmacist, emergency service, or formal medicine regulatory source.
- Claiming that stock, price, pharmacy licence, message delivery, payment, or clinical content is verified without evidence.
- Requiring a paid map or AI API to run the local demo.

---

## 1. How to use this spec

Before implementation, inspect the existing repo and document what is already present. Preserve valid code and user changes. If there is an established stack, keep it unless there is a clear, written technical reason to change. If the repo is empty, use the default stack in Section 4.

Implement in phases, but build end-to-end functionality. Each phase must leave the project runnable. Keep `BUILD_STATUS.md` up to date and do not mark an item complete unless code exists and relevant checks were run.

### Requirement status labels

Use these labels in the status file or PR notes:
- **Implemented + tested** — behavior exists and the listed checks passed.
- **Implemented, not verified** — code exists but a required check could not be run; explain why.
- **Simulated** — the UI/logic uses a simulator rather than a real external service.
- **Blocked** — a concrete dependency or credential prevents completion.
- **Not implemented** — not built yet.
- **Production gate** — requires real-world clinical, legal, operational, security, or provider review before serving real users.

---

## 2. Brand and design system

### 2.1 Logo meaning

The logo concept is a blue map pin containing a white circle with a green medical cross and a flowing “S” ribbon, a white ECG line across the lower pin, and green concentric ripples at its tip. The pin expresses pharmacy discovery, the ECG line expresses health tracking, and the ripples express reach and connection.

Use the supplied original logo file if it exists. Do not redraw a replacement logo or claim exact brand fidelity if the source asset is missing. If no logo asset is available, use the live-text wordmark and leave a documented asset slot for the approved file.

### 2.2 Tokens

Define tokens as CSS custom properties and in the Tailwind theme.

```css
:root {
  --color-primary-50: #E8F3FD;
  --color-primary-400: #0A95E8;
  --color-primary-500: #0B72D6;
  --color-primary-600: #0B6FD0;
  --color-primary-700: #0657A8;

  --color-secondary-50: #E9F7EC;
  --color-secondary-400: #2FAE4A;
  --color-secondary-600: #1A7F37;
  --color-secondary-700: #146B2D;
  --color-secondary-teal: #109A5E;

  --color-ink: #2B2F36;
  --color-muted: #5B6470;
  --color-border: #D9DEE5;
  --color-surface: #FFFFFF;
  --color-bg: #F7FAFC;

  --color-success: #1A7F37;
  --color-warning: #B25E00;
  --color-warning-bg: #FFF4E0;
  --color-danger: #C62828;
  --color-danger-bg: #FDECEC;
  --color-info: #0B6FD0;
}
```

Gradients may be used sparingly for hero accents and progress visuals:
- Brand: `linear-gradient(135deg, #0A95E8 0%, #0066CC 100%)`
- Health: `linear-gradient(180deg, #2FAE4A 0%, #109A5E 100%)`

**Contrast rules:** do not put white text on `#2FAE4A`; its contrast is insufficient. Use `#1A7F37` for green actions or text on light surfaces. White text on `#0B6FD0` is the preferred primary action. Verify the actual rendered combinations with automated accessibility checks; do not rely on visual guessing.

### 2.3 Wordmark and tone

- Render `MEDIMATE` as real text in header, login/register, landing page, footer, and simulator.
- `MEDI` uses `--color-secondary-600`; `MATE` uses `--color-primary-600`.
- Uppercase, geometric rounded sans-serif, weight 800, letter spacing about `0.04em`.
- Header wordmark around 24–28px; landing hero around 48–64px on wide screens, scaled responsively.
- Tagline below where appropriate: “Track • Remind • Live Healthier”, weight 400, muted color, subtle letter spacing.
- Use a clean single-color white mark only on dark/gradient surfaces if the approved asset offers it.

### 2.4 Interface quality bar

Use consistent 12–16px corner radii, soft and restrained shadows, generous but purposeful spacing, a clear type scale, Lucide icons, and minimum 44px primary touch targets. The app should feel calm, modern, trustworthy, and designed for health—not like a generic dashboard kit.

Use brand motifs with restraint: map pins in pharmacy discovery, a subtle ECG detail in health sections, and ripple feedback after reminders or messages are recorded as delivered. Keep most surfaces light by default. Dark mode is optional and must have rebalanced contrast rather than inverted token values.

Do not use random gradients, excessive glassmorphism, meaningless graphs, fake user counts, endless KPI cards, stock photography as decoration, needless animation, or emoji as the only UI icon. Respect `prefers-reduced-motion`. Use skeletons only where they match loading behavior, and provide purposeful empty, loading, success, validation, network-error, and permission-denied states.

### 2.5 Responsive and accessible behavior

- Mobile-first layouts; support narrow feature-phone simulator sizes, smartphones, tablets, and wide desktop.
- Keyboard-accessible navigation, sensible focus order, visible focus rings, labelled controls, accessible dialogs, semantic headings, and useful screen-reader announcements.
- Never rely on color alone for status; include a label and/or icon.
- Meet WCAG 2.1 AA as a target, validated with automated checks and manual keyboard review.
- Keep the initial experience light: lazy-load maps and charting libraries, split routes, compress assets, and avoid large libraries without reason.
- Use plain language and allow larger text without layout failure.

### 2.6 Copy tone

Warm, clear, practical, respectful, and not alarmist. Example: “Reminder not confirmed yet” rather than “You failed your dose.” Do not shame people for missed medicines, water, steps, or streaks. All clinical, legal, pricing, and safety copy must be editable where appropriate and reviewed before production.

---

## 3. Default technical architecture

Follow the current repository's stack if one exists. If the repository is empty, use this baseline unless you document a meaningful reason not to.

### Frontend

- React + TypeScript + Vite.
- Tailwind CSS using the version already selected by the project, with CSS variables for tokens.
- React Router for route-level navigation.
- TanStack Query (React Query) for server state, caching, and invalidation.
- React Hook Form or a similarly lightweight form tool, with Zod validation shared where practical.
- i18next for localization.
- PWA/service worker with an installable manifest and an offline shell; do not cache protected health data in a way that exposes it on shared devices.
- Leaflet + OpenStreetMap for map views, with a fully usable list fallback if tiles or geolocation fail.
- Accessible chart library only where history/trend visualization adds value.

### Backend

- Node.js + TypeScript + Express (or NestJS if already present and justified).
- REST endpoints with OpenAPI documentation.
- PostgreSQL + Prisma; migrations committed to source control.
- Redis + BullMQ for scheduled/queued tasks where available. Keep scheduling/queue behavior behind an interface so development can run predictably. Do not silently substitute an in-memory queue for reliable production scheduling.
- Provider-agnostic messaging interface for SMS/USSD, with an explicitly labelled local simulator. Africa’s Talking-style adapter shape is acceptable, but the selected provider and credentials must be configured by the deployer.
- JWT access/refresh or secure cookie sessions according to the existing app’s design; if JWT is used, keep access tokens short-lived, rotate refresh tokens, hash/store refresh-token identifiers safely, and protect against theft. Use Argon2id or bcrypt for passwords.
- OTP login via a provider adapter. Development-only OTP behavior must be impossible to mistake for production and must never log real production OTP codes.

### Shared, tests and operations

- Monorepo layout when starting fresh: `/web`, `/api`, `/shared`.
- Zod (or equivalent) schemas and shared types for request/response contracts.
- Vitest/Jest for unit/integration tests; Playwright for critical end-to-end journeys.
- axe-based accessibility checks where feasible.
- Docker Compose for local Postgres and Redis; `.env.example`; health-check endpoint; structured server logs; request IDs; safe error responses.
- Provide seed data, demo accounts, setup commands, and a no-provider demo mode.

### Architecture boundaries

Use distinct modules/services for authentication and authorization, consent, pharmacy verification, medicine catalogue, pharmacy stock, patient records, reminder scheduling, SMS parser, USSD state machine, billing/trial entitlements, audit logs, and provider adapters. Avoid putting core business logic directly in React components or route handlers.

Do not add an AI model dependency for clinical tips. The wellness tip library must be admin-curated and professionally reviewed before production use.

---

## 4. Roles and authorization

Implement the following roles and enforce them server-side on every protected operation:

1. **Patient** — manages their own profile, reminders, checkups, readings, history, and consent.
2. **Caretaker** — can access only explicitly linked patients and only the categories the patient has consented to share. Access must be revocable immediately.
3. **Pharmacy staff** — manages only their pharmacy profile, stock/prices, operating hours, and inquiries assigned to that pharmacy.
4. **Admin** — handles pharmacy verification, medicine records and source reviews, tip content, reports/moderation, languages, subscriptions, and audit views.
5. **Optional clinical reviewer** — may review health tips, medicine information, and configured clinical range rules; must not automatically receive access to identifiable patient records.

Authorization requirements:
- deny by default;
- check record ownership and relationship on the server, not just by role;
- test IDOR and cross-tenant access attempts;
- caretaker sharing has separate consent flags by data category;
- pharmacy staff cannot view patient clinical histories;
- support revocation, user export, and deletion workflows;
- log sensitive admin access and critical changes in an append-only audit trail.

---

## 5. Functional requirements

### 5.1 Public landing experience

Build a credible, polished landing page with a clear value proposition; the dual smartphone/feature-phone experience; a concise “how it works” section; pharmacy finder entry point; feature highlights; safety/privacy explanation; FAQs; calls to action; and footer links for privacy, terms, contact, and support. Do not invent adoption statistics, pharmacy counts, partners, testimonials, or regulatory approvals. Any dial code, short code, SMS number, or provider name must be configurable and labelled as a demo placeholder until provisioned.

### 5.2 Registration, authentication, onboarding

- Primary account identifier: phone number, normalized to E.164 where possible, with OTP through a provider adapter.
- Optional web email/password login, if implemented, with safe password policy and hashed storage.
- Same underlying account whether registration starts on SMS/USSD or web.
- Profile fields: display name, date of birth or age as appropriate, sex only if justified, preferred language, area/location, self-declared allergies/conditions, caretaker links, and communication preferences.
- Collect only fields needed for a specific feature; make sensitive profile fields optional unless necessary.
- Explain data use before collection; obtain separate consent for health data processing where applicable, SMS messaging, and caretaker access.
- Do not require a user to enter allergies or chronic conditions to use pharmacy search.
- Provide verification/resend rate limits, OTP expiry, attempt limits, generic anti-enumeration responses, and a clear development-mode warning if a local OTP is displayed.

### 5.3 Pharmacy finder and price comparison

- Search by medicine name, generic name, strength/form when applicable, and area/town.
- Show only pharmacies whose verification status is valid and approved by an admin.
- List stock state (`In stock`, `Low`, `Out`, `Unknown`), stated price/currency, pharmacy area/address, operating hours where supplied, last-updated time, and distance when location is available.
- Mark stock/price older than 48 hours as **stale**; never present stale information as confirmed current stock.
- Let users sort by price, distance, and freshness, with filters for area, open status when hours/timezone are reliable, verified status, and price range.
- Offer list and map views; list must remain usable when map tiles/geolocation are unavailable.
- Include pharmacy phone call (`tel:`) and inquiry actions.
- Highlight lowest listed price only among comparable medicine strength/form and non-stale prices; state comparison limitations.
- Do not claim a listed pharmacy has the medicine available in reality. Use wording such as “last reported in stock” with a timestamp.
- Stock updates need timestamps, actor, validation, and audit events. Admin can investigate reports of inaccurate stock or suspicious pharmacy behavior.

### 5.4 Verified medicine information

Medicine records may include approved/display names, generic name, strength, form, general indications as supplied by an authoritative source, general usage notes, warnings, interactions, storage, common side effects, source authority, source URL/reference, source/version date, reviewer, and last verification date.

- Admin/reviewer approval is required before a record is marked verified.
- Show source and last-reviewed timestamp to users.
- Never invent clinical descriptions or use generated content as an authoritative reference.
- If no reviewed content exists, say the information is not yet available rather than filling gaps from guesswork.
- Put an editable safety notice on each medicine page: **“Do not take medicine that was not prescribed or recommended for you. If you are unsure, ask a qualified pharmacist or health professional first.”** Treat this as draft copy pending client/clinical/legal review.
- SMS command `INFO <medicine>` returns a short excerpt only from an approved source and identifies MEDIMATE as the sender.

### 5.5 Medication list and reminders

- A patient can record an existing prescription/regimen: medicine name, prescription dose text exactly as entered, frequency, chosen times, start/end dates, refill date, and optional notes.
- The app stores and repeats the user's prescribed instructions; it must never calculate, propose, or change a prescription dose.
- Schedule reminders to patient using consented channels and, only with consent, a linked caretaker.
- Patient can confirm `TAKEN` or `SKIP` by SMS/USSD or by a web action. Store the event, timestamp, channel, and reminder ID.
- If unconfirmed after a configurable window, send a follow-up; if still unconfirmed after the configured escalation rule, notify the caretaker only if consent allows it. Phrase the alert neutrally and avoid naming a condition or medicine in SMS by default.
- Refill reminder is based on user-entered schedule/remaining supply where collected; explain assumptions. Do not infer stock consumption from dose history unless the user confirms it.
- Routine checkup reminders (for example BP check, diabetes review, or antenatal follow-up) can be added by the patient or their care team; do not create clinical schedules automatically.
- Show weekly/monthly adherence calculations transparently, distinguish skipped, missed, unknown, and confirmed events, and let the user correct mistakes with an audit record.
- Queue jobs must be idempotent, retry with bounded exponential backoff, record provider delivery status, and protect against duplicate reminders. Define timezone handling explicitly.

### 5.6 Vitals and wellness tips — no diagnosis

Allow optional recording of weight, height, blood pressure, blood glucose, heart rate, temperature, and optional self-reported sleep/mood if the product retains those items. Support manual entry first; device integrations are optional and must be explicit, consented, and tested.

- Show timestamped history and trends. Units must be visible and conversion rules tested.
- BMI, if included, is a transparent calculation from the entered height and weight and must be described as a screening measure, not a diagnosis. Avoid applying adult BMI categories to children.
- Do not classify readings as normal/abnormal or critical unless a documented and clinically approved rule set is supplied, versioned, configured, and test-covered. If no approved rules exist, show the data neutrally and advise contacting a qualified health professional with concerns.
- No disease prediction, diagnosis, treatment advice, or prescription changes.
- Tips come from an admin-managed library with author/reviewer, source, review date, language, topic, and publication state. Only reviewed tips can be published. Avoid personalized clinical advice based on sensitive details unless specifically designed and approved.
- Any emergency message or critical-range behavior is a production gate requiring locally appropriate, clinician-approved copy and rule review; never invent hotline numbers.
- Provide a persistent, plain-language disclaimer on health pages.

### 5.7 Steps and activity

- Feature-phone users can self-report an activity/step count through USSD/SMS; no claim that basic phones measure steps.
- Smartphone users can enter data manually; device-sensor import is optional and requires platform support and consent.
- Provide daily/weekly goals, progress, history, and streaks without shame-based wording.

### 5.8 Water intake

- Adjustable daily target, quick-log options (glass, bottle, custom amount), history, and configurable reminders.
- SMS/USSD command can add a user-entered count or volume with clear units.
- Guidance must be general and not imply the same target suits everyone; include a note that hydration needs vary.
- Any “healthy living products” section must be optional, admin-approved, clearly identified as informational, and not medical advice. Do not imply endorsement.

### 5.9 Patient history and export

- Chronological timeline containing medicine/reminder history, vitals, checkups, and user-entered reactions.
- Reaction log: free text, optional checklist, user-described severity, date/time, and a `show to my clinician` flag.
- Search/filter by date/type where useful.
- Export a patient-selected PDF summary for sharing with a clinician. Include export generation time, units, source attribution, and a note that it is user-entered data and not a diagnosis. Do not expose another person's information in the export.
- Provide account export and deletion workflows; deletion may require explicit confirmation and a retention/deletion policy review before production.

### 5.10 Pharmacy inquiries and pharmacy portal

Patient side:
- Call action, structured inquiry form, and a message thread per pharmacy.
- Show message state (`Open`, `Answered`, `Closed`) and timestamps.
- SMS inquiries are routed to the correct pharmacy inbox; pharmacy replies may be delivered by SMS when a provider is configured.

Pharmacy side:
- Dashboard for only the signed-in pharmacy.
- Manage profile, opening hours, verification status, product stock/price entries, single-item edits, CSV import with preview/validation/error report, inquiry inbox, quick replies, and relevant operational analytics.
- Analytics must be sourced from actual app events; never fill charts with decorative fabricated metrics.
- Validate phone numbers, message size, file size/type, CSV rows, and all input. Rate-limit and abuse-protect inquiry endpoints.

### 5.11 Caretaker portal

- Show linked patients only after the patient accepts the link and grants the relevant permission.
- Patient controls the categories shared: reminder status, checkups, selected readings/history, and/or other data categories in the schema.
- Provide unlink/revoke. On revocation, access must fail on the next request and existing sessions/caches must be invalidated appropriately.
- Alerts must be minimal and generic unless the patient has explicitly allowed detail.

### 5.12 SMS engine and simulator

Implement a deterministic, unit-tested SMS command parser that is case-insensitive, handles whitespace and common safe variations, validates inputs, supports a help hint for unknown commands, and returns messages with a MEDIMATE signature. Do not silently accept ambiguous medicine names or numerical units.

Supported commands (language codes configurable):

- `JOIN` — begin registration/onboarding.
- `FIND <medicine>, <area>` — show the top relevant verified pharmacies with freshness/stock/price details.
- `PRICE <medicine>, <area>` — compare eligible prices.
- `INFO <medicine>` — return reviewed medicine information.
- `CONTACT <code>` — start an inquiry to a selected pharmacy.
- `TAKEN` / `SKIP` — answer an active reminder safely; handle no-active-reminder and ambiguous multiple-reminder cases.
- `BP <systolic>/<diastolic>`, `SUGAR <value>`, `WEIGHT <kg>`, `WATER <amount>`, `STEPS <number>` — validate, save, confirm units, and avoid diagnosis.
- `HELP` — help menu.
- `LANG <code>` — change language only to a supported language.
- `STOP` — opt out of non-essential SMS; record consent withdrawal and do not keep sending routine reminders.
- `START` — re-enable only according to documented consent/verification rules.
- `MORE` — continue paginated output when available.

SMS constraints:
- Aim for under 160 GSM-7 characters per segment where practical; account for Unicode and multipart segment limits rather than assuming all characters cost one unit.
- Keep sensitive information out of message bodies. Use generic reminder copy by default.
- Do not send real outbound SMS in demo mode. Display simulated inbound/outbound messages and the adapter status clearly.
- Log message metadata and status; avoid storing message bodies indefinitely when not necessary. Redact sensitive content from ordinary application logs.

The browser simulator should look like a practical basic-phone interface, support incoming commands, show the outbound reply, expose the current simulated session state, let a tester move through flows, and include reset/replay controls. A simulation must never be styled or labelled as confirmed carrier delivery.

### 5.13 USSD menu and state machine

Provide a stateful USSD simulation for an example short code such as `*123#`; actual codes are configuration placeholders until provisioned.

Welcome: `Welcome to MEDIMATE`

1. Find medicine / Compare prices  
2. My reminders (view today / confirm taken)  
3. Log health (vitals / water / steps)  
4. Contact pharmacy  
5. Health tips  
6. My account (language, caretaker, trial status)

Rules:
- Each USSD screen should be short (target about 160 characters), use numbered choices, and support `0 Back` and `00 Home`.
- Enforce session timeouts, invalid-input handling, and safe resume behavior; do not resume by disclosing sensitive information on a shared phone.
- State transitions must be in a tested state machine independent of React UI.
- Language is chosen on the first session or via settings and can be changed to a supported language.
- For a live provider, implement an adapter contract for the provider's expected request/response format. The simulator is not a live USSD service.

### 5.14 Localization

- English is the fully authored base language.
- Include two clearly labelled placeholder locale folders/files for future local-language translation; do not pretend machine-filled placeholder strings are reviewed translations.
- Use translation keys rather than hardcoded UI copy for user-facing text.
- Admin may manage approved translation content if the scope includes translation management; preserve version/audit metadata.
- For SMS/USSD, ensure the selected language is retained per user/session and unsupported codes are rejected helpfully.

### 5.15 Subscription and trial

- Every new account starts a configurable 30-day trial when the account is created; server time is authoritative.
- After trial expiry, free tier keeps pharmacy finder, price comparison, approved medicine information, and pharmacy contact. Premium features may include medication reminders, vitals, steps, water, streaks, and patient-history export.
- Feature access must be enforced by the server, not only hidden in the UI.
- Trial banner and pre-expiry SMS are configurable and sent only with consent.
- Implement a mock subscription/payment page with a clearly labelled **test/demo checkout**. Keep mobile-money integration behind an adapter; never imply money was charged.
- Admin can configure trial length and feature entitlements with audit logs. Test the boundary at the exact expiry instant and timezone behavior.

### 5.16 Privacy, security, and user rights

- Clear consent screens for health data, SMS, and caretaker sharing; separate toggles by purpose/category where appropriate; allow withdrawal.
- TLS in transit in deployment; secure cookie/token configuration; password hashing; short-lived OTPs; CSRF protections where cookies are used; safe CORS; rate limiting; request size limits; brute-force protection; schema validation; output encoding; secure headers; dependency checks.
- Sensitive fields may require application-level encryption at rest with managed keys; do not roll custom crypto. Document key management and rotation. Database/disk encryption alone must not be described as field-level encryption.
- Minimize personal/health details in URLs, logs, analytics, error tracking, notifications, and SMS.
- Use role-based access plus object-level authorization. Audit access to sensitive data and all admin status changes.
- Add data export and deletion/anonymization where legally and operationally appropriate. Clearly document backups, retention, legal holds, and deletion limits before production.
- Generic public authentication responses to reduce account enumeration.
- Create a threat-model / production readiness checklist in the README or `SECURITY.md`.
- Do not claim compliance with a law or certification based solely on code. Identify jurisdictions and obtain qualified legal/privacy review before real patient deployment.

---

## 6. Routes and screens

Use a consistent app shell, role-aware navigation, breadcrumbs/section headings where useful, and responsive mobile navigation. Do not render every role's navigation to every user.

### Public
- Landing page.
- Pharmacy finder (browse/search only from approved, sufficiently fresh records).
- Medicine information.
- Login / registration / OTP flow.
- Privacy policy, terms, support/contact, and safety disclaimer.

### Patient
- Overview/dashboard.
- Medicines and reminders.
- Checkups.
- Vitals and wellness tips.
- Steps/activity.
- Water intake.
- Streaks/adherence.
- Patient history/reactions/export.
- Caretaker links and permissions.
- Pharmacy inquiries/messages.
- Settings: language, notification preferences, consent, account/export/deletion, trial/subscription.

### Caretaker
- Linked-patient list.
- Per-patient permission-limited overview.
- Reminder escalations and relevant alerts.
- Access/connection state with revoke/unlink behavior.

### Pharmacy
- Overview.
- Stock and price management.
- CSV bulk import with preview.
- Inquiry inbox.
- Public profile and opening hours.
- Verification status and submitted documents/status.
- Event-backed analytics.

### Admin / reviewer
- Pharmacy verification queue and evidence review.
- Medicine database management with source/reviewer/version fields.
- Health tips and configured range rules review/publish.
- Inaccurate stock/suspicious pharmacy reports.
- Users, role changes, subscriptions/entitlements.
- SMS/USSD logs and simulator.
- Translation management.
- Audit logs.

### Demo tools
- Browser SMS/USSD simulator with test scripts and visible simulated-mode marker.
- Seeded role accounts documented for local demo, not production.

---

## 7. Minimum data model

Use normalized relations, correct indexes/constraints, timestamps, soft-delete or archival policies only where justified, and clear tenant boundaries. At minimum model the equivalents of:

- `User`, `Profile`, `Role` (or an explicit user-role relation).
- `Session` / refresh-token record and `OtpChallenge` as needed.
- `CaretakerLink` / `CareLink` with status and per-category consent flags.
- `Consent` with purpose, scope, version, granted/withdrawn timestamps, channel, and capture provenance.
- `Pharmacy`, `PharmacyVerification`, verification documents/metadata, and `PharmacyHours`.
- `Medicine`, `MedicineSource`, verification/review history.
- `PharmacyStock` (medicine, price/currency, stock state/quantity if applicable, updated time, actor, stale state derivation).
- `Inquiry`, `Message`.
- `MedicationPlan`, `ReminderSchedule`, `ReminderOccurrence` or `ReminderLog`, confirmation/missed/escalation events.
- `Checkup`.
- `VitalReading`, `StepLog`, `WaterLog`.
- `ReactionLog`.
- `Streak` or a derivable summary if persistence is justified.
- `HealthTip`, `HealthTipReview`, approved rule set/version if range classifications are configured.
- `Report` / `Flag` / moderation event.
- `Subscription`, `Trial`, `Entitlement` / feature configuration.
- `SmsLog`, provider delivery-event metadata, `UssdSession` and state.
- `AuditLog`.
- `Translation` / locale versioning where required.

Deliver a Prisma schema and an ER diagram (Mermaid or a clearly documented equivalent). Add unique constraints and indexes for phone identifiers, pharmacy/medicine lookups, stock freshness, due reminders, inquiry status, ownership, trial expiry, and audit queries. Use decimal types for money and carefully chosen numeric types/units for measurements. Avoid storing age as the only age representation when date of birth is already collected; consider privacy/data minimization when choosing DOB versus age.

### Data integrity rules

- Normalize phone numbers consistently and avoid logging raw numbers where unnecessary.
- Store measurement units explicitly or enforce a canonical unit consistently, with tested conversions.
- Keep history of verification state changes and medicine source revisions.
- Record time in UTC and render in the user's configured timezone; capture timezone when required for scheduling.
- Distinguish “unknown” stock from “out of stock.”
- Do not use a single boolean that hides pending/rejected/expired verification states.
- Ensure duplicate reminder processing cannot create multiple logical outcomes.

---

## 8. API and service expectations

Design REST endpoints around resources and user journeys, validate requests/responses, apply authorization in service/API layers, return consistent error shapes, and document endpoints in OpenAPI. The exact route names can follow existing conventions, but cover these capabilities:

- Auth: registration, OTP challenge/verify/resend, logout/session renewal, account export/deletion.
- Profile/preferences/consents.
- Pharmacy search/detail/inquiry and medicine info.
- Pharmacy profile, stock CRUD, CSV preview/import, inquiry inbox/reply, verification submission/status.
- Medication plans, reminder schedules/occurrences, confirm/skip, checkup CRUD.
- Vitals, steps, water, reactions, history and PDF export.
- Caretaker invitations, acceptance, permission changes, unlink/revoke.
- SMS webhook/message handling and simulator endpoints.
- USSD adapter handler and simulator state actions.
- Admin review/publish/moderation/translation/entitlement/audit actions.
- Subscription/trial status and mock checkout session.
- `/health` or `/healthz` that reports application readiness without exposing secrets.

Use cursor or bounded pagination on potentially large lists, filters/sorting with explicit whitelists, transaction boundaries around related writes, and idempotency keys or unique event constraints on provider callbacks and reminder confirmations. Never return stack traces or secret configuration to clients.

---

## 9. Testing strategy and critical flows

### Unit tests
- SMS parser: valid commands, case/whitespace handling, malformed numbers, unsupported languages, ambiguous reminder, unknown commands, STOP/START behavior, segment pagination.
- USSD state machine: every state transition, `0 Back`, `00 Home`, invalid options, timeout, resume without sensitive disclosure, language selection.
- Stale pharmacy stock logic (>48h) and lowest-price comparison only among comparable records.
- Pharmacy verification filter: pending/rejected/expired pharmacies never appear as approved results.
- Reminder scheduling: timezone, daylight-saving where applicable, retry/backoff, idempotency, confirmation windows, escalation and caretaker consent.
- Role/ownership authorization and consent-category enforcement.
- Trial expiration and server-side premium entitlement enforcement.
- Units/conversions and neutral presentation of vitals without approved clinical rules.
- Input validation, CSV import rejection paths, and safe error behavior.

### Integration tests
- Registration/OTP adapter in test mode.
- Patient creates regimen → scheduled reminder → simulator sends notification → patient confirms TAKEN/SKIP → event is persisted exactly once.
- No confirmation → escalation only after configured windows and only to an authorized, consenting caretaker.
- Pharmacy submits/updates stock → admin verifies pharmacy → fresh item appears in public search → item becomes stale after 48 hours.
- Patient links caretaker, grants one category, caretaker can read only that category, then patient revokes access and reads fail.
- Trial expiry locks premium features on API and UI while free pharmacy features remain available.
- Account export/deletion path does not export or delete another user's records.

### End-to-end journeys (Playwright)
1. Public visitor searches for a clearly labelled demo medicine and sees only an approved demo pharmacy, a price, and a last-updated timestamp.
2. Patient signs in through the development OTP flow, reviews consent, creates a reminder from their own regimen text, and marks it taken in the simulator.
3. Feature-phone user runs JOIN/FIND/PRICE/INFO/WATER/STEPS/TAKEN/HELP through the SMS simulator.
4. Feature-phone user navigates USSD menu, returns Back/Home, changes language, and experiences session timeout safely.
5. Pharmacy staff imports stock using CSV preview, corrects errors, and answers an inquiry.
6. Admin reviews a pharmacy, medicine source, and health tip; unapproved records remain unpublished.
7. Caretaker access is granted and revoked; authorization checks are verified.
8. Trial expiry removes premium access server-side.

Run accessibility checks on core routes and manual keyboard checks. Include responsive checks at narrow mobile, tablet, and desktop widths. Avoid flaky timing assumptions; use deterministic fake clocks and test providers for scheduled workflows.

---

## 10. Build phases and exit criteria

Do not attempt every screen at once. Complete vertical slices in this order and keep the app runnable at every phase.

### Phase 0 — Repository audit and implementation map
**Do:** inspect files, scripts, stack, Git status, app routes, environment, database, tests, and current UI. Identify existing working assets/components. Create/update `BUILD_STATUS.md` and an implementation checklist.

**Exit:** clear audit, setup commands confirmed or gaps documented, no user changes discarded. Continue immediately to Phase 1.

### Phase 1 — Foundation and design system
**Do:** establish/repair scripts, TypeScript configuration, shared validation/types, route shell, responsive design tokens, wordmark, typography, buttons/forms/tables/dialogs/feedback components, navigation, error boundaries, i18n scaffold, PWA base, and seed/dev mode labels.

**Exit:** app starts, core routes render, design tokens are centralized, type check and production build pass, no console-breaking errors.

### Phase 2 — Auth, profiles, roles, consent, audit
**Do:** schema/migrations, dev OTP provider, provider interface, login/register, sessions, onboarding, user preferences, role-aware route protection, server-side object authorization, granular consent, caretaker-link foundation, audit records, demo users.

**Exit:** all demo roles can sign in; cross-user and cross-role unauthorized access tests pass; consent state is stored and revocable; migrations and seed setup are repeatable.

### Phase 3 — Medicine catalogue and pharmacy discovery
**Do:** source-aware medicine records, pharmacy verification workflow, stock and price history/freshness, search filters/sort, list/map fallback, medicine information page and safety copy, report inaccurate stock flow.

**Exit:** unverified pharmacies never appear in public search; source/review metadata is visible; items older than 48 hours are flagged stale; comparisons are valid and tested.

### Phase 4 — SMS parser, gateway interface, and SMS simulator
**Do:** deterministic command parser, supported command handlers, simulated inbound/outbound message log, multi-page `MORE`, consent-aware STOP/START, test fixtures, provider interface/webhook verification contract.

**Exit:** SMS command tests pass; key feature-phone flows work without real credentials; simulated delivery is unmistakably labelled; no live SMS can accidentally be sent in demo mode.

### Phase 5 — USSD state machine and simulator
**Do:** state machine independent of UI, menus, navigation, validation, timeouts, language selection, safe session handling, simulator phone frame, provider adapter contract.

**Exit:** USSD transition tests pass for every menu branch, Back/Home, invalid input and timeouts; simulator can demonstrate the same underlying account as the web/SMS flow where supported.

### Phase 6 — Medication reminders, checkups, queues, caretaker escalation
**Do:** regimen entry, reminder schedule and occurrences, timezone handling, confirmation/skip history, retry/backoff/idempotence, refill/checkup reminders, consenting caretaker alerts, delivery status abstraction.

**Exit:** patient journey works end to end with a test provider; duplicate jobs/callbacks do not duplicate actions; escalation is consent-aware; no medicine dose is proposed or edited by the app.

### Phase 7 — Vitals, steps, water, reactions, patient history
**Do:** data entry and validation, explicit units, trends, neutral default vitals display, reviewed-tip library, steps/water logs, reaction timeline, history search, patient-only PDF export.

**Exit:** logged data persists and renders accurately; unit and export tests pass; no unapproved range classifications or unreviewed clinical tips are presented as authoritative.

### Phase 8 — Pharmacy portal and caretaker portal
**Do:** stock CRUD, CSV preview/import, pharmacy inquiry inbox/replies, event-backed metrics, caretaker overview constrained by per-category permissions, revocation/invalidation.

**Exit:** pharmacy tenant isolation and caretaker authorization tests pass; inquiry threads work through simulator; CSV errors are safely explained; analytics use actual event data.

### Phase 9 — Subscription, admin/review, localization
**Do:** trial computation, free/premium feature entitlements enforced server-side, mock checkout label, configurable feature flags, admin queues, medicine/tip/translation publishing, audit screens, locale files.

**Exit:** expiry boundary is tested; free-tier features continue to work; unauthorized premium API calls fail; unapproved content remains unpublished; language fallback is deterministic.

### Phase 10 — Production hardening and handoff
**Do:** complete API/OpenAPI docs, ER diagram, README, `.env.example`, Docker setup, test fixtures, access-control review, log redaction, rate limits, provider configuration guide, accessibility pass, responsive/browser review, performance audit, deployment/security checklist, backup/retention notes.

**Exit:** test suite, typecheck, lint and production build pass where configured; remaining failures are explicitly documented; install/run/demo steps are verified; external-service and production gates are honest and clear.

---

## 11. Required project deliverables

1. Source code organized for the chosen repository architecture (fresh default: `/web`, `/api`, `/shared`).
2. Database schema, migration history, repeatable demo seed data, and ER diagram.
3. Responsive public site and functional role-based web application.
4. Pharmacy search, stock/pricing freshness, medicine sources/reviews, and report workflow.
5. SMS gateway abstraction, command parser, simulator, and test fixtures.
6. USSD state machine, simulator, and provider adapter contract.
7. Reminder scheduler, confirmation loop, delivery metadata, idempotency, retry behavior, and caretaker escalation.
8. Patient tracking/history and clinician-shareable patient-controlled PDF export.
9. Admin, pharmacy, patient, and caretaker capabilities in scope.
10. OpenAPI documentation, README, `.env.example`, local Docker setup, and `BUILD_STATUS.md`.
11. Tests for the core safety, consent, authorization, SMS/USSD, reminder, stock-freshness, and trial flows.
12. Clear production-readiness list separating code-complete tasks from provider setup, clinical review, legal/privacy review, operations, and deployment.

---

## 12. Acceptance criteria

The minimum acceptable end-to-end result must satisfy all applicable checks below or mark an item blocked/not implemented with a precise reason.

- A simulated feature-phone user can begin onboarding, search for a medicine, compare eligible prices, contact a pharmacy, confirm a reminder, and log water/steps/vitals using SMS/USSD flows.
- A patient can use the same underlying account via web and the simulator.
- Reminder confirmations persist once; missed confirmations escalate according to configured rules and only with appropriate caretaker consent.
- Only authorized, approved pharmacies appear in public results; demo data is labelled as fictional/demo.
- Pharmacy stock/price freshness is visible and records over 48 hours old are flagged stale.
- Medicine verification shows source, reviewer, and date; unreviewed medicine content is not labelled verified.
- No UI, API, SMS, or USSD response diagnoses a user or recommends prescription medication/doses.
- Patient records are protected against cross-user access and caretaker sharing follows fine-grained consent.
- A patient can revoke caretaker access; subsequent protected requests are denied.
- After the configurable trial expires, premium features are blocked at the API and UI while free pharmacy discovery/contact still works.
- STOP disables routine/non-essential SMS according to documented rules; START does not bypass required re-consent/verification.
- The MEDIMATE wordmark is bold and two-tone across the primary app surfaces, tokens are centralized, contrast/accessibility checks run, and mobile layouts work.
- Setup instructions work from a clean local environment, or any infrastructure/credential blocker is clearly described.
- Tests, type check, lint, and production build have real recorded outcomes.

---

## 13. Production gates — do not wave these away

Before real patients use MEDIMATE, the operator must complete the relevant items below. The codebase should make these responsibilities visible instead of claiming they are solved by building the app.

- [ ] Confirm legal entity, operating geography, target jurisdictions, data-controller/processor roles, and applicable health/privacy/telecom rules with qualified counsel.
- [ ] Review privacy notices, consent language, retention/deletion policy, data-subject workflows, cross-border processing, and vendor contracts.
- [ ] Have qualified local clinicians/pharmacists review medicine content, wellness tips, any ranges/thresholds, emergency instructions, and safety copy.
- [ ] Verify pharmacies and medicines against valid authoritative sources and maintain a repeatable review/re-verification process.
- [ ] Provision and test real SMS/USSD numbers, approved sender IDs/templates where required, delivery receipts, STOP handling, throughput, costs, and provider incident behavior.
- [ ] Configure secrets, TLS, database encryption, backups/restoration, key management, monitoring/alerts, log retention/redaction, least-privilege deployment access, and incident response.
- [ ] Run independent security review/penetration testing appropriate for the intended risk and user base.
- [ ] Complete accessibility testing with representative users and relevant assistive technologies.
- [ ] Confirm trial/payment terms and configure a real payment adapter only after provider approval; a mock checkout must never capture real money.
- [ ] Test escalation policy, shared-phone privacy, consent revocation, data deletion limits, and safe messaging using representative local scenarios.

No developer or agent should claim legal compliance, clinical approval, pharmacy verification, or production readiness unless it has actual supporting evidence.

---

## 14. Local setup and environment expectations

The README must document exact working commands for the repository's chosen package manager. For a fresh monorepo, provide an equivalent of:

1. Install dependencies.
2. Copy `.env.example` to a local ignored `.env` file.
3. Start PostgreSQL and Redis with Docker Compose.
4. Run Prisma migrations.
5. Seed fictional demo records and demo role accounts.
6. Start frontend and backend in development.
7. Run unit/integration tests, lint, type checking, and production builds.
8. Start Playwright/browser tests and the browser SMS/USSD simulator.

Use safe example values only. List optional provider settings separately and explain how the system behaves when they are absent. The app must fail clearly at startup when required configuration is missing, but it should still support the explicitly designed local simulator mode.

---

## 15. Final handoff response format

When implementation work is complete or a meaningful stopping point is reached, provide:

1. **Implemented:** specific features and journeys that actually work.
2. **Verification:** exact commands run and actual results; distinguish passing, failing, skipped, and blocked checks.
3. **Run it:** short, copy-paste setup and start commands.
4. **Demo accounts and simulator:** local-only credentials/flow, clearly marked non-production.
5. **External configuration:** missing provider keys, phone numbers, domains, and services.
6. **Production gates:** outstanding clinical, pharmacy, legal/privacy, security, operations, and deployment reviews.
7. **Known limitations:** no vague claim that everything is done when important behavior remains simulated or untested.

**Operating rule:** inspect → plan → implement → test → update status → continue. Never stop at a polished landing page when the specification calls for a working product.
