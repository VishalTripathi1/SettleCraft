import { it, expect } from 'vitest';
import { assess } from '../src/modules/risk/service.js';
it('returns deterministic reasons and bounded scores', () => {
  expect(
    assess({ amount: 50000n, recentCount: 0, recentAmount: 0n, newAccount: false, failures: 0 }),
  ).toMatchObject({ score: 0, action: 'ALLOW' });
  const result = assess({
    amount: 2000000n,
    recentCount: 6,
    recentAmount: 100000n,
    newAccount: true,
    failures: 3,
  });
  expect(result.score).toBe(100);
  expect(result.action).toBe('REVIEW');
  expect(result.signals).toHaveLength(5);
});
