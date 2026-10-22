// Vercel build: writes Build Output API v3 to .vercel/output (https://vercel.com/docs/build-output-api/v3).
//
//   static/              the Vite build of web/ (SPA)
//   functions/api.func/  one Node.js function: the Express API bundled with esbuild
//   config.json          routes (/api/* -> function, files, SPA fallback), headers, daily cron
//
// When DATABASE_URL is set (Neon via the Vercel integration), migrations run here and the fictional
// demo data is seeded only if the database has no users yet, so cold starts never migrate or seed.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel', 'output');
const fnDir = join(out, 'functions', 'api.func');

function run(cmd, args, cwd = root) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${r.status}`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(fnDir, { recursive: true });

// 1. Web app -> static/
run('npm', ['run', 'build', '-w', 'web']);
cpSync(join(root, 'web', 'dist'), join(out, 'static'), { recursive: true });

// 2. API -> one ESM function. Third-party CommonJS packages (express, pg) need `require` inside ESM.
await build({
  entryPoints: [join(root, 'server', 'src', 'vercel.ts')],
  outfile: join(fnDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  // PGlite is only for local development (lazy import, never reached when DATABASE_URL is set).
  external: ['@electric-sql/pglite', 'pg-native', 'drizzle-orm/pglite', 'drizzle-orm/pglite/migrator'],
  logLevel: 'info',
});
cpSync(join(root, 'server', 'drizzle'), join(fnDir, 'drizzle'), { recursive: true });
writeFileSync(
  join(fnDir, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', maxDuration: 30 }, null, 2),
);

// 3. Routing, caching and security headers.
const csp = [
  "default-src 'self'",
  "script-src 'self' https://apis.google.com https://www.gstatic.com",
  // React style attributes and Leaflet positioning use inline styles.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.tile.openstreetmap.org https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://apis.google.com https://*.firebaseapp.com",
  // Firebase Google sign-in opens a popup and talks to an iframe on the project's auth domain.
  "frame-src https://*.firebaseapp.com https://accounts.google.com https://apis.google.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = {
  'Content-Security-Policy': csp,
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
  // same-origin-allow-popups keeps the Google sign-in popup able to report back.
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

const config = {
  version: 3,
  routes: [
    { src: '^/(.*)$', headers: securityHeaders, continue: true },
    { src: '^/assets/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '^/(sw\\.js|index\\.html|manifest\\.webmanifest)$', headers: { 'Cache-Control': 'no-cache' }, continue: true },
    // The function receives the original path in __path as well, in case the platform rewrites req.url.
    { src: '^/api/(.*)$', dest: '/api?__path=$1' },
    { src: '^/api$', dest: '/api' },
    { handle: 'filesystem' },
    { src: '^/(.*)$', dest: '/index.html', headers: { 'Cache-Control': 'no-cache' } },
  ],
  // Hobby plans allow one run per day. The reminder engine also runs on each API request and from the
  // simulator, so reminders still go out between cron runs while people use the app.
  crons: [{ path: '/api/cron/tick', schedule: '0 6 * * *' }],
};
writeFileSync(join(out, 'config.json'), JSON.stringify(config, null, 2));

// 4. Database: migrate, then seed fictional demo data into an empty database.
if (process.env.DATABASE_URL) {
  run('npx', ['tsx', 'src/db/migrate-cli.ts'], join(root, 'server'));
  run('npx', ['tsx', 'src/db/seed-cli.ts', '--if-empty'], join(root, 'server'));
} else {
  console.log('\nDATABASE_URL is not set: skipping migrations and demo seed.');
}

if (!existsSync(join(out, 'static', 'index.html'))) throw new Error('static/index.html missing');
console.log(`\nBuild Output API v3 written to ${out}`);
