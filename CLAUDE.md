# MEDIMATE — Claude Code project instructions

Governing spec: `MEDIMATE_Claude_Code_Kit/MEDIMATE_EXECUTION.md` (source of truth) and `MEDIMATE_Claude_Code_Kit/CLAUDE.md` (working rules). Read them before changing code. Keep `BUILD_STATUS.md` honest and up to date.

## Layout
- `shared/` — framework-free logic + Zod schemas (SMS parser, USSD state machine, freshness, entitlements, units, time zones). Unit tests: `npm test -w shared`.
- `server/` — Express 5 API, Drizzle ORM on PostgreSQL (PGlite locally, Neon/Postgres via `DATABASE_URL`). Integration tests: `npm test -w server`.
- `web/` — React 19 + Vite + Tailwind v4 + TanStack Query + React Router.

## Local run (Windows)
- Ports 4000 and 8787 are reserved by Windows on this machine. API runs on **3001**, web on **5173**.
- Use the Browser preview launchers in `.claude/launch.json` (`medimate-api`, `medimate-web`); servers started from the sandboxed shell are not reachable.
- `npm run db:seed` resets fictional demo data (PGlite at `server/.data/pglite`).

## Rules that are easy to break
- Never put secrets in git. `.env` is ignored; `.env.example` holds placeholders only.
- Fictional demo numbers are `+237 600 xxx xxx`; codes are shown on screen only for those (or when the SMS simulator is active). Real numbers always get codes by real SMS.
- Design (see `docs/DESIGN.md`): app-like and mobile first, pressable 3D buttons/cards (`.btn-3d`, `.card-3d`), Today path, grouped list rows, Me hub instead of a hamburger, labelled bottom tab bar, no decorative gradients/blobs, no em dashes in UI copy, Atkinson Hyperlegible Next body + Nunito headings.
- No diagnosis, no dose changes, no unreviewed clinical text, no fake stats.
