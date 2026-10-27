import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
config({ quiet: true });
if (!process.env.TEST_DATABASE_URL?.includes('settlecraft_test'))
  throw new Error('TEST_DATABASE_URL must target settlecraft_test');
export default defineConfig({
  test: {
    env: { NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL },
    fileParallelism: false,
    testTimeout: 15000,
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
});
