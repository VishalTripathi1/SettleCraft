import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Each browser receives a fresh API process and its own in-memory rate-limit window.
// Keep production limits intact, and keep all database-backed suites sequential.
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const args = process.argv.slice(2);
const explicitProject = args.some((arg) => arg === '--project' || arg.startsWith('--project='));
const informational = args.some((arg) => ['--list', '--help', '-h'].includes(arg));
const projects = explicitProject || informational ? [null] : ['webkit', 'desktop', 'mobile'];
for (const project of projects) {
  const result = spawnSync(
    process.execPath,
    [cli, 'test', ...args, ...(project ? ['--project', project] : [])],
    { stdio: 'inherit' },
  );
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
