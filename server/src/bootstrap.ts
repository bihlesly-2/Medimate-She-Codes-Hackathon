import { count } from 'drizzle-orm';
import { loadConfig, loadDotEnv, type Config } from './config';
import { openDatabase, type Database } from './db/client';
import { users } from './db/schema';
import { seedDemo } from './db/seed';
import { systemClock, type Clock } from './lib/clock';
import { createLogger, type Logger } from './lib/logger';
import { createMessagingProvider, type MessagingProvider } from './providers/messaging';
import { createPaymentProvider, type PaymentProvider } from './providers/payments';
import type { Deps } from './types';

export interface RuntimeOptions {
  config?: Config;
  pgliteDir?: string | 'memory';
  clock?: Clock;
  logger?: Logger;
  messaging?: MessagingProvider;
  payments?: PaymentProvider;
  poolMax?: number;
}

export async function createRuntime(opts: RuntimeOptions = {}): Promise<{ deps: Deps; database: Database }> {
  if (!opts.config) loadDotEnv();
  const config = opts.config ?? loadConfig();
  const database = await openDatabase({ url: config.DATABASE_URL, pgliteDir: opts.pgliteDir ?? config.PGLITE_DIR, poolMax: opts.poolMax });
  const deps: Deps = {
    db: database.db,
    config,
    clock: opts.clock ?? systemClock,
    logger: opts.logger ?? createLogger(),
    messaging: opts.messaging ?? createMessagingProvider(config),
    payments: opts.payments ?? createPaymentProvider(config),
  };
  return { deps, database };
}

/** Apply migrations and, in demo mode, seed fictional demo data into an empty database. */
export async function prepareDatabase(deps: Deps, database: Database, opts: { seedIfEmpty: boolean }) {
  await database.migrate();
  if (opts.seedIfEmpty && deps.config.DEMO_MODE) {
    const [row] = await deps.db.select({ n: count() }).from(users);
    if (Number(row?.n ?? 0) === 0) {
      await seedDemo(deps, { reset: false });
      deps.logger.info('demo_seeded', {});
    }
  }
}
