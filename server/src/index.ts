import { createApp } from './app';
import { createRuntime, prepareDatabase } from './bootstrap';
import { startScheduler } from './scheduler';

/** Long-running server for local development or a container deployment. */
async function main() {
  const { deps, database } = await createRuntime();
  await prepareDatabase(deps, database, { seedIfEmpty: true });
  const app = createApp(deps);
  const stop = startScheduler(deps);
  const server = app.listen(deps.config.PORT, () => {
    deps.logger.info('server_started', {
      port: deps.config.PORT,
      database: database.kind,
      demoMode: deps.config.DEMO_MODE,
      messaging: deps.messaging.name,
      payments: deps.payments.name,
    });
  });
  const shutdown = async () => {
    stop();
    server.close();
    await database.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
