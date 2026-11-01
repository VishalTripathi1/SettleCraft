import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Each browser/file receives a fresh API process and its own rate-limit window.
// Keep production limits intact; database-backed suites remain sequential.
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const args = process.argv.slice(2);
const explicitProject = args.some((arg) => arg === '--project' || arg.startsWith('--project='));
const informational = args.some((arg) => ['--list', '--help', '-h'].includes(arg));
const explicitFile = args.some((arg) => /\.spec\.[cm]?[jt]sx?$/.test(arg));
const projects = explicitProject || informational ? [null] : ['webkit', 'desktop', 'mobile'];
const files =
  explicitFile || informational ? [null] : ['flows.spec.ts', 'reversals.spec.ts', 'stress.spec.ts'];
for (const project of projects) {
  for (const file of files) {
    const result = spawnSync(
      process.execPath,
      [
        cli,
        'test',
        ...args,
        ...(file ? [`apps/web/e2e/${file}`] : []),
        ...(project ? ['--project', project] : []),
      ],
      { stdio: 'inherit' },
    );
    if (result.error) {
      console.error(result.error.message);
      process.exit(1);
    }
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
