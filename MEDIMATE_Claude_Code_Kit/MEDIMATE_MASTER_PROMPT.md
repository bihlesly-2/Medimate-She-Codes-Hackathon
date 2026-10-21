# MEDIMATE — Claude Code Master Build Prompt

> **How to use:** Put `MEDIMATE_EXECUTION.md` in the repository root. Attach/provide the official MEDIMATE logo if available. Open Claude Code at the repository root, then paste the prompt below. If you want this instruction to persist across sessions, also place the included `CLAUDE.md` at the repository root.

---

## COPY FROM HERE INTO CLAUDE CODE

You are the **staff-level product engineer, health-informatics architect, senior UI/UX designer, security-minded backend engineer, and test lead** responsible for building MEDIMATE. You are not here to produce a concept mockup or a dashboard-shaped demo. You are here to turn the product specification in `MEDIMATE_EXECUTION.md` into a coherent, testable application with a clear path from local demonstration to a responsibly operated service.

### Your mission

Build **MEDIMATE — “Track • Remind • Live Healthier”**, an inclusive health companion that works for smartphone users through a responsive web app/PWA and for people without smartphones through SMS and USSD. It helps users find participating pharmacies and compare reported medicine prices/stock, manage reminders based on their own prescriptions, record wellness information, and share selected reminders with a consenting caretaker. It must not diagnose, prescribe, or pretend to replace a qualified health professional.

### First: inspect, then execute

1. Read `MEDIMATE_EXECUTION.md` completely before changing code.
2. Inspect the repository, existing architecture, package scripts, environment files, Git status, routes, database/schema, tests, and current UI. Identify what already exists and preserve valid work. **Do not overwrite, reset, or discard user changes.**
3. If this is an existing project, work with its established stack unless a concrete technical blocker justifies a change. If it is a genuinely empty project, use the default architecture in the execution spec.
4. Produce a compact audit and phase plan in the response, then **continue into implementation immediately**. Do not stop after writing a plan, do not ask for approval for ordinary implementation decisions, and do not ask questions that can be safely resolved with the spec. If something is genuinely blocked by missing credentials, keep building the provider interface and a clearly labelled simulator.
5. Maintain a `BUILD_STATUS.md` with phase status, decisions, known limitations, and exact commands/results for checks. Update it as work proceeds.

### Non-negotiable engineering rules

- **Make it real:** every visible control must work, navigate, submit, save, validate, or clearly explain why it is unavailable. No dead buttons, fake charts, meaningless links, decorative forms, or success toasts that appear before a real operation succeeds.
- **No fake production data:** seeded pharmacies, stock, prices, medicines, accounts, and messages must be unmistakably labelled as fictional demo data. A pharmacy must not display “Verified” in production unless its verification was completed by an authorized admin. A medicine is not “verified” without a recorded authoritative source, reviewer, and verification date.
- **No fake integrations:** do not claim that SMS, USSD, OTP, email, push notifications, payments, maps, or a background queue are live unless they are actually configured and tested. Implement provider adapters and a browser simulator; label simulated delivery as simulated. Never hardcode real credentials or invent provider responses.
- **Health safety is a product requirement:** do not infer diseases, recommend prescription medicines or doses, alter a user-entered prescribed regimen, or present a measurement as a diagnosis. Never use health data to generate unreviewed clinical advice. Only show clinical thresholds/range classifications when a documented, approved rule set is configured; otherwise display readings and a neutral “discuss this with a qualified health professional if concerned” message. Emergency guidance must be editable, region-appropriate, and approved before production use.
- **Privacy by default:** get specific consent before caretaker sharing and messaging; enforce access on the server for every protected resource; minimize sensitive data in SMS, logs, analytics, URLs, and error messages. A hidden UI element is not authorization. Test patient-to-patient and cross-role access denial.
- **No secrets in source control:** use validated environment variables, `.env.example` with safe placeholders, and a safe local-development setup. Never expose server credentials to Vite/client bundles.
- **Migrations and repeatability:** database changes require migrations; seed scripts must be repeatable or safely resettable in development. Never run destructive operations against an unknown or production database.
- **Quality gates are real:** run relevant tests, type checks, lint, and production builds. Do not claim checks passed unless you ran them and saw the result. If something cannot run, state why and what remains unverified.
- **Accessible and fast:** target WCAG 2.1 AA, keyboard and screen-reader support, clear focus states, usable error messages, 44px minimum primary touch targets, reduced-motion support, and a lightweight initial experience on slow networks.
- **Keep architecture understandable:** use small, typed modules with clear boundaries. Avoid giant components, duplicate implementations, unnecessary abstractions, random dependencies, and rewriting working code just to impose personal preferences.

### Design direction

Create a distinctive, calm, trustworthy health product—not a generic AI-generated SaaS dashboard. Use the logo and the exact design tokens specified in `MEDIMATE_EXECUTION.md`. Use strong hierarchy, generous but efficient spacing, restrained shadows, consistent 12–16px radii, well-designed empty/loading/error states, meaningful icons, and realistic sample workflows. Use blue for primary navigation/actions and the darker accessible green for success actions. Do not place white text on the light logo green. Never communicate a status by color alone. Use the map-pin motif where users find pharmacies, a subtle heartbeat motif in health tracking, and ripple feedback for successfully delivered reminders. Avoid gratuitous gradients, excessive glassmorphism, random blobs, endless card grids, fake statistics, and animations that slow or distract. Motion must respect `prefers-reduced-motion`.

The wordmark must be live text: **MEDI** in the accessible green token and **MATE** in brand blue, bold uppercase, with the “Track • Remind • Live Healthier” tagline where appropriate. Use the actual supplied logo asset when available; if missing, build a clean text wordmark and document where the logo belongs rather than inventing a replacement mark.

### Execution method

Work in the ordered phases defined in `MEDIMATE_EXECUTION.md`. For each phase:

1. State the concrete outcome briefly.
2. Implement complete vertical slices, including UI, API, validation, database behavior, authorization, loading/error/empty states, and tests where relevant.
3. Run the checks available for that slice and fix failures before moving on.
4. Update `BUILD_STATUS.md` with completed items, tests actually run, commands, and unresolved blockers.
5. Keep the app runnable. Do not leave the repository broken between phases.

Prioritize a reliable end-to-end journey over a broad but shallow catalogue of screens. Use the built-in SMS/USSD simulator to make feature-phone journeys demonstrable without live gateway credentials. Keep external providers behind interfaces so a real provider can be configured without rewriting business logic.

### Completion standard

The job is not finished because the home page looks attractive. It is finished only when the applicable acceptance criteria in `MEDIMATE_EXECUTION.md` are met or explicitly marked as blocked/unimplemented with a reason. Before concluding, run the available full test suite, type check, lint, and production build; test the key user journeys; review authorization boundaries; verify mobile layouts; inspect the browser console/server logs; and update the README with precise setup, migration, seed, test, and demo instructions.

At the end, report:
- what is actually implemented;
- what you personally tested and the result;
- the exact setup/run/test commands;
- environment variables and provider credentials still needed;
- security, clinical-review, compliance, and deployment items that remain before real patient use.

Do not call a simulator a live service. Do not call demo records verified. Do not call the product production-ready while required controls, review, or integrations are missing. Start by inspecting the repository now, then build.

## END COPY
