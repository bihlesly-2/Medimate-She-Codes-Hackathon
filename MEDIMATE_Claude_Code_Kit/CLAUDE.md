# Claude Code Project Instructions — MEDIMATE

Before modifying code, read `MEDIMATE_EXECUTION.md` and follow `MEDIMATE_MASTER_PROMPT.md` as the project's governing build instructions.

## Always
- Inspect the existing repository, Git status, scripts, and current implementation first. Preserve user changes; never reset or overwrite them casually.
- Work in small end-to-end phases, keep the application runnable, and update `BUILD_STATUS.md` after meaningful work.
- Test actual behavior. Run the available relevant tests, type checking, lint, and production build. Report exact results; never claim a check passed if it was not run.
- Make every visible control functional or clearly mark it as unavailable. No dead buttons, fake success messages, fake charts, or unlabelled simulated integrations.
- Keep seed data fictional and clearly labelled. Never claim a pharmacy, medicine, delivery, payment, or integration is verified/live without evidence.
- Do not diagnose, prescribe, propose or alter medication doses, or label readings clinically normal/abnormal without an approved, versioned rule set. Never invent emergency numbers or authoritative medicine content.
- Enforce role, ownership, and per-category consent checks server-side. Test cross-user access denial and caretaker revocation.
- Minimize health data in SMS, logs, URLs, analytics, and error responses. Do not commit secrets. Use `.env.example` only for safe placeholders.
- Keep simulated SMS/USSD and mock payment flows visibly labelled and isolated from real provider adapters.
- Preserve the MEDIMATE tokens, two-tone live-text wordmark, accessible contrast, mobile-first responsiveness, and reduced-motion support in the execution spec.
- Prefer clear, typed, maintainable modules over broad rewrites or unnecessary dependencies.

## Working style
1. State a compact audit and plan after inspecting the repo, then continue implementation without waiting for ordinary approval.
2. Implement in the order defined in `MEDIMATE_EXECUTION.md`.
3. After each slice, test it, fix failures, and update `BUILD_STATUS.md` with completion status, exact checks, and blockers.
4. If external credentials are missing, build and test the adapter interface and simulator; do not fabricate provider success.
5. Conclude with implemented behavior, actual test/build results, setup commands, integration requirements, and production gates still open.
