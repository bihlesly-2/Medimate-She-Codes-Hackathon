import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: DB;
  kind: 'pglite' | 'postgres';
  migrate(): Promise<void>;
  close(): Promise<void>;
}

function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../drizzle'), // server/src/db → server/drizzle
    resolve(here, 'drizzle'), // bundled: <bundle dir>/drizzle
    resolve(process.cwd(), 'drizzle'),
    resolve(process.cwd(), 'server/drizzle'),
  ];
  const found = candidates.find((c) => existsSync(resolve(c, 'meta/_journal.json')));
  if (!found) throw new Error(`Migrations folder not found. Looked in:\n${candidates.join('\n')}`);
  return found;
}

/**
 * Open the database.
 * - `url` set → PostgreSQL via node-postgres (Neon, Docker, any managed Postgres).
 * - otherwise → embedded PGlite (PostgreSQL compiled to WASM) at `pgliteDir`, or in memory for tests.
 *   PGlite is imported lazily so serverless bundles never load it.
 */
export async function openDatabase(opts: { url?: string; pgliteDir?: string | 'memory'; poolMax?: number }): Promise<Database> {
  if (opts.url) {
    const pool = new pg.Pool({
      connectionString: opts.url,
      max: opts.poolMax ?? 10,
      ssl: /sslmode=require|neon\.tech/.test(opts.url) ? { rejectUnauthorized: true } : undefined,
    });
    const db = drizzlePg(pool, { schema }) as unknown as DB;
    return {
      db,
      kind: 'postgres',
      migrate: () => migratePg(db as never, { migrationsFolder: migrationsFolder() }),
      close: () => pool.end(),
    };
  }
  const [{ PGlite }, { drizzle: drizzlePglite }, { migrate: migratePglite }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
    import('drizzle-orm/pglite/migrator'),
  ]);
  let client: InstanceType<typeof PGlite>;
  if (!opts.pgliteDir || opts.pgliteDir === 'memory') {
    client = new PGlite();
  } else {
    const dir = resolve(opts.pgliteDir);
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  await client.waitReady;
  const db = drizzlePglite(client, { schema }) as unknown as DB;
  return {
    db,
    kind: 'pglite',
    migrate: () => migratePglite(db as never, { migrationsFolder: migrationsFolder() }),
    close: () => client.close(),
  };
}
