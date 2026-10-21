import { createRuntime } from '../bootstrap';

const { deps, database } = await createRuntime({ poolMax: 1 });
await database.migrate();
deps.logger.info('migrations_applied', { database: database.kind });
await database.close();
