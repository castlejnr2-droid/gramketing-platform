/**
 * Unit tests for Fix #5: referral sybil farming — scraper-side qualification.
 *
 * Run with:
 *   npx ts-node --transpile-only lib/__tests__/referral.test.ts
 *
 * No DB or API calls — we test the pure qualification and bonus-computation
 * logic extracted from lib/pool-scraper.ts Phase 3.
 */

export {}; // module scope — prevents name collisions with other test files

// ── Pure logic extracted from pool-scraper.ts Phase 3 ────────────────────────

const REFERRAL_BASE_BONUS = 500;

/**
 * Mirrors the minHolding derivation in Phase 3.
 * When tier1Threshold is 0 (unset), require at least 1 token unit so the check
 * is always meaningful (BigInt can't be negative, so >= 0n is trivially true).
 */
function deriveMinHolding(tier1Threshold: bigint): bigint {
  return tier1Threshold > 0n ? tier1Threshold : 1n;
}

/**
 * Mirrors the per-referral qualification gate in Phase 3.
 */
function qualifies(holding: bigint, postCount: number, minHolding: bigint): boolean {
  return holding >= minHolding && postCount >= 1;
}

/**
 * Mirrors the full Phase 3 loop for one referrer.
 * referrals = array of { holding, postCount } per referred wallet.
 * Returns { qualifyingCount, referredTotal, bonusPoints }.
 */
function computeReferralResults(
  referrals: Array<{ holding: bigint; postCount: number }>,
  minHolding: bigint,
): { qualifyingCount: number; referredTotal: bigint; bonusPoints: number } {
  let referredTotal = 0n;
  let qualifyingCount = 0;

  for (const r of referrals) {
    if (qualifies(r.holding, r.postCount, minHolding)) {
      referredTotal += r.holding;
      qualifyingCount++;
    }
  }

  return {
    qualifyingCount,
    referredTotal,
    bonusPoints: qualifyingCount * REFERRAL_BASE_BONUS,
  };
}

/** Mirrors the self-referral guard in track/route.ts */
function isSelfReferral(referrerUserId: string, referredUserId: string): boolean {
  return referrerUserId === referredUserId;
}

// ── Tiny test harness ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function serialize(v: unknown): string {
  // JSON.stringify can't handle BigInt — convert to string representation first
  return JSON.stringify(v, (_k, val) =>
    typeof val === 'bigint' ? `${val}n` : val,
  );
}

function check(label: string, actual: unknown, expected: unknown) {
  const ok = serialize(actual) === serialize(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${serialize(expected)}`);
    console.error(`      actual:   ${serialize(actual)}`);
    failed++;
  }
}

function suite(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ── minHolding derivation ─────────────────────────────────────────────────────

suite('deriveMinHolding: tier1Threshold unset (0) → 1n', () => {
  check('tier1Threshold=0 gives minHolding=1', deriveMinHolding(0n), 1n);
});

suite('deriveMinHolding: tier1Threshold set → use it directly', () => {
  check('tier1Threshold=1000 gives minHolding=1000', deriveMinHolding(1000n), 1000n);
  check('tier1Threshold=1 gives minHolding=1',       deriveMinHolding(1n),    1n);
});

// ── Condition (1): holding < min → does NOT qualify ──────────────────────────

suite('referred holds 0 (< min=1) → contributes 0', () => {
  const min = deriveMinHolding(0n); // effective 1n
  const result = computeReferralResults([{ holding: 0n, postCount: 1 }], min);
  check('qualifying count = 0',  result.qualifyingCount, 0);
  check('referredTotal = 0n',    result.referredTotal,   0n);
  check('bonusPoints = 0',       result.bonusPoints,     0);
});

suite('referred holds below explicit tier1Threshold → contributes 0', () => {
  const min = deriveMinHolding(1000n);
  const result = computeReferralResults([{ holding: 999n, postCount: 1 }], min);
  check('qualifying count = 0', result.qualifyingCount, 0);
  check('bonusPoints = 0',      result.bonusPoints,     0);
});

// ── Condition (2): holding >= min but no post → does NOT qualify ──────────────

suite('referred holds >= min but has 0 posts → contributes 0', () => {
  const min = deriveMinHolding(100n);
  const result = computeReferralResults([{ holding: 500n, postCount: 0 }], min);
  check('qualifying count = 0', result.qualifyingCount, 0);
  check('referredTotal = 0n',   result.referredTotal,   0n);
  check('bonusPoints = 0',      result.bonusPoints,     0);
});

// ── Both conditions met → qualifies ──────────────────────────────────────────

suite('referred holds >= min AND has >= 1 post → +500 + counts toward multiplier', () => {
  const min = deriveMinHolding(100n);
  const result = computeReferralResults([{ holding: 100n, postCount: 1 }], min);
  check('qualifying count = 1',    result.qualifyingCount, 1);
  check('referredTotal = 100n',    result.referredTotal,   100n);
  check('bonusPoints = 500',       result.bonusPoints,     500);
});

suite('holding strictly greater than min AND multiple posts → still 1 qualifying count', () => {
  const min = deriveMinHolding(100n);
  const result = computeReferralResults([{ holding: 9999n, postCount: 5 }], min);
  check('qualifying count = 1', result.qualifyingCount, 1);
  check('referredTotal = 9999n', result.referredTotal, 9999n);
  check('bonusPoints = 500', result.bonusPoints, 500);
});

// ── Revocation: previously qualifying, wallet drops below min → 0 next cycle ─

suite('Revocation: wallet sells, drops below min → next cycle contributes 0', () => {
  const min = deriveMinHolding(100n);

  // Cycle N: holding was 500n, 1 post → qualifies
  const cycleN = computeReferralResults([{ holding: 500n, postCount: 1 }], min);
  check('[cycle N] qualifies: bonusPoints = 500', cycleN.bonusPoints, 500);

  // Cycle N+1: wallet sold down to 50n, still has post → no longer qualifies
  const cycleN1 = computeReferralResults([{ holding: 50n, postCount: 1 }], min);
  check('[cycle N+1] revoked: bonusPoints = 0',  cycleN1.bonusPoints, 0);
  check('[cycle N+1] revoked: referredTotal = 0n', cycleN1.referredTotal, 0n);
});

suite('Revocation: wallet holds but deletes post → next cycle contributes 0', () => {
  const min = deriveMinHolding(100n);

  // Cycle N: holding 500n, has post → qualifies
  const cycleN = computeReferralResults([{ holding: 500n, postCount: 1 }], min);
  check('[cycle N] qualifies: bonusPoints = 500', cycleN.bonusPoints, 500);

  // Cycle N+1: still holds but no posts → revoked
  const cycleN1 = computeReferralResults([{ holding: 500n, postCount: 0 }], min);
  check('[cycle N+1] revoked: bonusPoints = 0', cycleN1.bonusPoints, 0);
});

// ── Self-referral still blocked in route ─────────────────────────────────────

suite('Self-referral (same userId) is blocked', () => {
  check('same id → self-referral',     isSelfReferral('user-1', 'user-1'), true);
  check('different ids → not self-ref', isSelfReferral('user-1', 'user-2'), false);
});

// ── Many qualifying referrals: no cap ────────────────────────────────────────

suite('Many qualifying referrals all count (no cap)', () => {
  const min = deriveMinHolding(100n);
  const referrals = Array.from({ length: 20 }, (_, i) => ({
    holding: BigInt((i + 1) * 200), // all well above min
    postCount: 1,
  }));
  const result = computeReferralResults(referrals, min);
  check('all 20 qualify',                result.qualifyingCount, 20);
  check('bonusPoints = 20 × 500 = 10000', result.bonusPoints,   10000);
  // referredTotal = 200+400+...+4000 = 200*(1+2+...+20) = 200*210 = 42000
  check('referredTotal = 42000n',        result.referredTotal,   42000n);
});

// ── Mixed: some qualify, some don't ──────────────────────────────────────────

suite('Mixed referrals: only those meeting both conditions count', () => {
  const min = deriveMinHolding(100n);
  const referrals = [
    { holding: 0n,    postCount: 1 }, // fails condition 1
    { holding: 200n,  postCount: 0 }, // fails condition 2
    { holding: 150n,  postCount: 2 }, // qualifies
    { holding: 99n,   postCount: 3 }, // fails condition 1 (< 100n)
    { holding: 100n,  postCount: 1 }, // qualifies (exactly at min)
  ];
  const result = computeReferralResults(referrals, min);
  check('qualifying count = 2',          result.qualifyingCount, 2);
  check('bonusPoints = 2 × 500 = 1000',  result.bonusPoints,     1000);
  check('referredTotal = 150n + 100n',   result.referredTotal,   250n);
});

// ── points.ts: calculateTotalPoints still consumes both fields ────────────────

suite('calculateTotalPoints: referralBonusPoints + referralMultiplier consumed correctly', () => {
  // Mirror the formula: contentScore * holderBoost * referralMultiplier + referralBonusPoints
  function calcTotal(
    contentScore: number,
    holderBoost: number,
    referralMultiplier: number,
    referralBonusPoints: number,
  ): number {
    return contentScore * holderBoost * referralMultiplier + referralBonusPoints;
  }

  // 0 qualifying referrals → referralBonusPoints=0, multiplier stays 1.0
  check('zero qualifying: bonus=0 has no effect',
    calcTotal(1000, 1.5, 1.0, 0), 1500);

  // 2 qualifying → +1000 bonus, multiplier 1.3x
  check('two qualifying: bonus=1000 added after multiply',
    calcTotal(1000, 1.5, 1.3, 1000), 1000 * 1.5 * 1.3 + 1000);

  // Revocation: next cycle bonus drops to 0, multiplier to 1.0
  check('after revocation: same as zero qualifying',
    calcTotal(1000, 1.5, 1.0, 0), 1500);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
