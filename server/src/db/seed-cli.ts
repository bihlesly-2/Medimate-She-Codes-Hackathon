import { createRuntime } from '../bootstrap';
import { seedDemo } from './seed';

/**
 * `npm run db:seed` — resets and reseeds FICTIONAL demo data.
 * `npm run db:seed -- --if-empty` — seeds only when there are no users (used by the Vercel build).
 * Refuses to reset a production database unless it is the explicitly labelled public demo.
 */
const ifEmpty = process.argv.includes('--if-empty');
const { deps, database } = await createRuntime({ poolMax: 1 });
if (deps.config.isProduction && !deps.config.PUBLIC_DEMO) {
  console.error('Refusing to seed demo data into a production database.');
  process.exit(1);
}
await database.migrate();
const result = await seedDemo(deps, { reset: !ifEmpty, onlyIfEmpty: ifEmpty });
deps.logger.info(result.seeded ? 'demo_seeded' : 'demo_seed_skipped', { reason: result.reason });
await database.close();
