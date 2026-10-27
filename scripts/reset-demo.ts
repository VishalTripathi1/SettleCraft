import { env } from '../apps/api/src/config/env.js';
import { pool } from '../apps/api/src/db/pool.js';
import { migrate } from '../apps/api/src/db/migrate.js';
import { seed } from '../apps/api/src/db/seed.js';
const target = new URL(env.DATABASE_URL);
const local = ['localhost', '127.0.0.1'].includes(target.hostname);
if (
  !local ||
  target.pathname !== '/settlecraft' ||
  !process.argv.includes('--confirm-settlecraft')
) {
  console.error(
    'Refusing reset. Only the local database named settlecraft can be reset. Stop the dev servers first, back up if needed, then pass --confirm-settlecraft explicitly.',
  );
  await pool.end();
  process.exitCode = 1;
} else {
  console.log('Resetting explicitly confirmed local database: settlecraft');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await migrate();
  await seed();
  await pool.end();
}
