import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express } from 'express';
import { createApp } from './app';
import { createRuntime } from './bootstrap';

/**
 * Vercel serverless entry. Migrations and the demo seed run during the build (scripts/vercel-build.mjs),
 * so cold starts only open a small connection pool. The reminder engine runs on request, from the
 * simulator, and from the daily cron (see docs/DEPLOYMENT.md).
 */
let appPromise: Promise<Express> | null = null;

function getApp() {
  appPromise ??= createRuntime({ poolMax: 3 })
    .then(({ deps }) => createApp(deps))
    .catch((err) => {
      appPromise = null;
      throw err;
    });
  return appPromise;
}

/**
 * The build routes `/api/(.*)` to this function as `/api?__path=$1`. If the platform hands the
 * function the rewritten URL, rebuild `/api/<path>?<original query>` so Express routes it normally;
 * either way the helper parameter is removed.
 */
export function restoreOriginalUrl(url: string | undefined): string {
  const raw = url ?? '/';
  const u = new URL(raw, 'http://localhost');
  const path = u.searchParams.get('__path');
  if (path === null) return raw;
  u.searchParams.delete('__path');
  const rewritten = u.pathname === '/api' || u.pathname === '/api/';
  const pathname = rewritten ? `/api/${path.split('/').map(encodeURIComponent).join('/')}` : u.pathname;
  const query = u.searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  req.url = restoreOriginalUrl(req.url);
  try {
    const app = await getApp();
    app(req as never, res as never);
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'startup_failed', error: err instanceof Error ? err.message : String(err) }));
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'STARTUP_FAILED', message: 'The service is not configured correctly yet.' } }));
  }
}
