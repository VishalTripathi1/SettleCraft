export const rules = [
  { id: 'large_amount', description: 'Amount of ₹10,000 or more', points: 65 },
  { id: 'velocity', description: 'Five or more requests in the previous 10 minutes', points: 45 },
  {
    id: 'aggregate',
    description: 'Including this request, ₹20,000 or more in the previous hour',
    points: 35,
  },
  {
    id: 'new_account',
    description: 'Account under 24 hours old sending ₹5,000 or more',
    points: 20,
  },
  {
    id: 'failures',
    description: 'Three or more failed requests in the previous 10 minutes',
    points: 30,
  },
];
export function assess(input: {
  amount: bigint;
  recentCount: number;
  recentAmount: bigint;
  newAccount: boolean;
  failures: number;
}) {
  const hits = [
    input.amount >= 1000000n,
    input.recentCount >= 5,
    input.recentAmount + input.amount >= 2000000n,
    input.newAccount && input.amount >= 500000n,
    input.failures >= 3,
  ];
  const signals = rules.filter((_r, i) => hits[i]);
  const score = Math.min(
    100,
    signals.reduce((s, r) => s + r.points, 0),
  );
  return {
    score,
    level: score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW',
    action:
      signals.filter((s) => s.id !== 'large_amount').reduce((sum, s) => sum + s.points, 0) >= 60
        ? 'REVIEW'
        : input.amount >= 1000000n
          ? 'VERIFY'
          : score >= 60
            ? 'REVIEW'
            : 'ALLOW',
    signals,
    ruleVersion: '2.0',
  };
}
