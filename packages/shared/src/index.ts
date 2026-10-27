import { z } from 'zod';
export const PRODUCT_NAME = 'SettleCraft';
export const DEMO_NOTICE = 'Demo / simulated funds — no real money';
export const amountSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/, 'Use a positive amount with at most two decimal places')
  .refine(
    (v) => /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(v) && parseAmount(v) > 0n,
    'Amount must be positive',
  );
export function parseAmount(value: string): bigint {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value)) throw new Error('Invalid INR amount');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export const transferSchema = z
  .object({
    recipientId: z.uuid(),
    amount: amountSchema,
    currency: z.literal('INR'),
    note: z.string().trim().max(160).default(''),
  })
  .strict();
export const credentialsSchema = z
  .object({ email: z.email().trim().toLowerCase().max(254), password: z.string().min(12).max(128) })
  .strict();
export const registerSchema = credentialsSchema.extend({ name: z.string().trim().min(2).max(80) });
export type User = { id: string; name: string; email: string; role: 'USER' | 'ADMIN' };
