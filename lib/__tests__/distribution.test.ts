/**
 * Unit tests for the largest-remainder basis-point distribution.
 *
 * Run with:
 *   npx ts-node --transpile-only lib/__tests__/distribution.test.ts
 *
 * No DB access — we test the pure arithmetic directly by extracting the
 * calculation logic from distribution.ts.
 */

export {}; // make this a module so top-level names don't collide with other test files

// ── Pure implementation (mirrors lib/distribution.ts logic) ──────────────────

function computeBps(points: number[]): number[] {
  if (points.length === 0) return [];
  const totalPoints = points.reduce((a, b) => a + b, 0);
  if (totalPoints === 0) return points.map(() => 0);

  const exactShares = points.map((p) => (p / totalPoints) * 10000);
  const floors = exactShares.map(Math.floor);
  const remainders = exactShares.map((exact, i) => exact - floors[i]);

  let leftover = 10000 - floors.reduce((a, b) => a + b, 0);

  const order = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map(({ i }) => i);

  const bps = [...floors];
  for (let k = 0; k < leftover; k++) {
    bps[order[k]] += 1;
  }
  return bps;
}

// ── Tiny test harness ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown) {
  const ok =
    typeof expected === 'number'
      ? actual === expected
      : JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function suite(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

function sumIs10000(bps: number[]) {
  return bps.reduce((a, b) => a + b, 0) === 10000;
}

function noNegatives(bps: number[]) {
  return bps.every((b) => b >= 0);
}

function noOver10000(bps: number[]) {
  return bps.every((b) => b <= 10000);
}

// ── Test cases ────────────────────────────────────────────────────────────────

suite('1 winner', () => {
  const bps = computeBps([999]);
  expect('sum === 10000', sumIs10000(bps), true);
  expect('single winner gets exactly 10000', bps[0], 10000);
  expect('no negatives', noNegatives(bps), true);
  expect('none > 10000', noOver10000(bps), true);
});

suite('2 equal winners', () => {
  const bps = computeBps([500, 500]);
  expect('sum === 10000', sumIs10000(bps), true);
  expect('each gets 5000', JSON.stringify(bps), JSON.stringify([5000, 5000]));
  expect('no negatives', noNegatives(bps), true);
});

suite('3 equal winners (classic 9999 bug case)', () => {
  // 10000 / 3 = 3333.33… — Math.round gives 3333 each → 9999 (old bug)
  const bps = computeBps([1, 1, 1]);
  expect('sum === 10000', sumIs10000(bps), true);
  expect('no negatives', noNegatives(bps), true);
  expect('none > 10000', noOver10000(bps), true);
  // Largest-remainder gives [3334, 3333, 3333]
  const sorted = [...bps].sort((a, b) => b - a);
  expect('one winner gets 3334', sorted[0], 3334);
  expect('other two get 3333', sorted[1], 3333);
});

suite('7 equal winners', () => {
  const bps = computeBps([1, 1, 1, 1, 1, 1, 1]);
  expect('sum === 10000', sumIs10000(bps), true);
  expect('no negatives', noNegatives(bps), true);
  expect('none > 10000', noOver10000(bps), true);
  // 10000 / 7 = 1428.57… → floors are 1428, leftover = 10000 - 7*1428 = 4
  // so 4 winners get 1429, 3 get 1428
  const counts = bps.reduce<Record<number, number>>((acc, b) => {
    acc[b] = (acc[b] ?? 0) + 1;
    return acc;
  }, {});
  expect('four winners get 1429', counts[1429], 4);
  expect('three winners get 1428', counts[1428], 3);
});

suite('Unequal split: 6000 / 3000 / 1000 points', () => {
  const bps = computeBps([6000, 3000, 1000]);
  expect('sum === 10000', sumIs10000(bps), true);
  expect('no negatives', noNegatives(bps), true);
  expect('none > 10000', noOver10000(bps), true);
  expect('first gets 6000 bps', bps[0], 6000);
  expect('second gets 3000 bps', bps[1], 3000);
  expect('third gets 1000 bps', bps[2], 1000);
});

suite('Unequal split with non-divisible remainders: 1 / 2 / 3 points', () => {
  // total = 6; exact shares: 1666.67, 3333.33, 5000
  const bps = computeBps([1, 2, 3]);
  expect('sum === 10000', sumIs10000(bps), true);
  expect('no negatives', noNegatives(bps), true);
  expect('none > 10000', noOver10000(bps), true);
  // floors: 1666, 3333, 5000 → sum = 9999, leftover = 1 → goes to index 0 (remainder 0.67)
  expect('index 0 gets 1667', bps[0], 1667);
  expect('index 1 gets 3333', bps[1], 3333);
  expect('index 2 gets 5000', bps[2], 5000);
});

suite('Large field: 10 equal winners', () => {
  const bps = computeBps(Array(10).fill(1));
  expect('sum === 10000', sumIs10000(bps), true);
  expect('no negatives', noNegatives(bps), true);
  expect('each gets exactly 1000', bps.every((b) => b === 1000), true);
});

suite('Tie-breaking: stable order (first index wins on equal remainder)', () => {
  // 3 winners with points [1, 1, 1] — same remainders.
  // The extra bp should go to index 0, then 1, then 2 (stable sort).
  const bps = computeBps([1, 1, 1]);
  expect('sum === 10000', sumIs10000(bps), true);
  // One winner gets 3334; with stable tie-break it must be index 0.
  expect('index 0 gets the extra bp', bps[0], 3334);
});

suite('Random-ish large split (13 winners, arbitrary points)', () => {
  const pts = [412, 88, 503, 77, 210, 99, 305, 44, 188, 267, 391, 55, 161];
  const bps = computeBps(pts);
  expect('sum === 10000', sumIs10000(bps), true);
  expect('no negatives', noNegatives(bps), true);
  expect('none > 10000', noOver10000(bps), true);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
