import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const dir = new URL('../.local/postgres', import.meta.url).pathname;
const socket = '/tmp/settlecraft-pg';
function run(command, args) {
  const r = spawnSync(command, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
if (process.argv[2] === 'stop') {
  run('pg_ctl', ['-D', dir, '-m', 'fast', 'stop']);
  process.exit();
}
mkdirSync(socket, { recursive: true, mode: 0o700 });
if (!existsSync(`${dir}/PG_VERSION`))
  run('initdb', [
    '-D',
    dir,
    '-U',
    'settlecraft',
    '--auth-local=trust',
    '--auth-host=scram-sha-256',
    '--encoding=UTF8',
    '--no-locale',
  ]);
if (spawnSync('pg_ctl', ['-D', dir, 'status'], { stdio: 'ignore' }).status !== 0)
  run('pg_ctl', [
    '-D',
    dir,
    '-l',
    new URL('../.local/postgres.log', import.meta.url).pathname,
    '-o',
    `-k ${socket} -p 55432 -h ''`,
    'start',
  ]);
for (const db of ['settlecraft', 'settlecraft_test']) {
  const result = spawnSync(
    'psql',
    [
      '-h',
      socket,
      '-p',
      '55432',
      '-U',
      'settlecraft',
      '-d',
      'postgres',
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname='${db}'`,
    ],
    { encoding: 'utf8' },
  );
  if (!result.stdout.trim())
    run('createdb', ['-h', socket, '-p', '55432', '-U', 'settlecraft', db]);
}
const envFile = new URL('../.env', import.meta.url);
if (!existsSync(envFile))
  writeFileSync(
    envFile,
    readFileSync(new URL('../.env.example', import.meta.url), 'utf8').replace(
      'replace-with-at-least-32-random-characters',
      randomBytes(48).toString('hex'),
    ),
    { mode: 0o600 },
  );
console.log('SettleCraft local databases ready. Socket-only, port 55432.');
