import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
let directory = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(directory, '.env')) && dirname(directory) !== directory)
  directory = dirname(directory);
config({ path: join(directory, '.env'), quiet: true });
export const env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1024).max(65535).default(4000),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    BREVO_API_KEY: z.string().min(1).optional(),
    MAIL_FROM: z.email().optional(),
    DATABASE_URL: z.string().min(1),
    APP_ORIGIN: z.url().default('http://127.0.0.1:5173'),
    JWT_SECRET: z.string().min(32),
    DEMO_PASSWORD: z.string().min(12).default('SettleCraft-demo-2026!'),
  })
  .parse(process.env);
