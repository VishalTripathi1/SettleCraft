import { describe, it, expect } from 'vitest';
import { amountSchema, parseAmount } from './index.js';
describe('exact INR parsing', () => {
  it('parses decimal amounts without floating point', () => {
    expect(parseAmount('0.29')).toBe(29n);
    expect(parseAmount('500')).toBe(50000n);
    expect(parseAmount('123.4')).toBe(12340n);
  });
  it.each([
    '0',
    '-1',
    '1.001',
    '1e4',
    'NaN',
    '9999999999',
    '1; DROP TABLE users',
    ' 1',
    '01',
    '1.',
  ])('rejects %s', (v) => expect(amountSchema.safeParse(v).success).toBe(false));
});
