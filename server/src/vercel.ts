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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
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
