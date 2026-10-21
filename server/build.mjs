// Production bundle for the API. Third-party packages stay external (installed via npm);
// the workspace package @medimate/shared is TypeScript source and is bundled in.
import { build } from 'esbuild';
import { readFileSync, cpSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@medimate/shared');

await build({
  entryPoints: ['src/index.ts', 'src/db/migrate-cli.ts', 'src/db/seed-cli.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  external,
  logLevel: 'info',
});
cpSync('drizzle', 'dist/drizzle', { recursive: true });
