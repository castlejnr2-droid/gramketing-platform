/**
 * Unit tests for Fix #4: tweet authorship check + pool-wide dedup.
 *
 * Run with:
 *   npx ts-node --transpile-only lib/__tests__/submissions.test.ts
 *
 * No DB or real API calls — we test pure logic extracted from the submission
 * route and twitter-api module.
 */

export {}; // make this a module so top-level names don't collide with other test files

// ── Pure logic extracted from submissions/route.ts ────────────────────────────

/**
 * Mirrors the author-check decision in the submission route (fail-closed).
 *
 * Returns:
 *   'reject' — mismatch OR unconfirmable (null authorId)
 *   'pass'   — confirmed match (authorId === userXAccountId)
 *
 * null is intentionally treated as 'reject': a bypass-inducing API failure
 * must not grant access.
 */
function checkTweetOwnership(
  tweetAuthorId: string | null,
  userXAccountId: string,
): 'reject' | 'pass' {
  if (!tweetAuthorId || tweetAuthorId !== userXAccountId) return 'reject';
  return 'pass';
}

/**
 * Mirrors the pool-wide dedup check in the submission route.
 * existingPosts is a simplified in-memory stand-in for the DB query result.
 */
function checkPoolDedup(
  existingPosts: Array<{ poolId: string; postLink: string }>,
  poolId: string,
  postLink: string,
): 'duplicate' | 'ok' {
  const found = existingPosts.some(
    (p) => p.poolId === poolId && p.postLink === postLink,
  );
  return found ? 'duplicate' : 'ok';
}

// ── Tiny test harness ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
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

// ── Author ownership tests ────────────────────────────────────────────────────

suite('Tweet authored by a DIFFERENT account → reject', () => {
  // Attacker's tweet has author_id "9999999"
  // User's linked xAccountId is "1234567"
  check(
    'confirmed mismatch is rejected',
    checkTweetOwnership('9999999', '1234567'),
    'reject',
  );
});

suite("Tweet authored by the user's own account → pass", () => {
  check(
    'confirmed match is allowed',
    checkTweetOwnership('1234567', '1234567'),
    'pass',
  );
});

suite('API unavailable / unconfirmable (null authorId) → REJECT (fail-closed)', () => {
  check(
    'null authorId is rejected, not passed through',
    checkTweetOwnership(null, '1234567'),
    'reject',
  );
});

suite('Edge: empty string authorId → reject (treated as unconfirmable)', () => {
  check(
    'empty string is falsy — treated as unconfirmable, rejected',
    checkTweetOwnership('', '1234567'),
    'reject',
  );
});

suite('Edge: authorId numerically same value, same string → pass', () => {
  // Twitter numeric IDs are strings throughout; comparison is string equality
  check(
    'numeric-looking string matches correctly',
    checkTweetOwnership('1234567890123456789', '1234567890123456789'),
    'pass',
  );
});

// ── Pool-wide dedup tests ─────────────────────────────────────────────────────

const POOL_A = 'pool-aaa';
const POOL_B = 'pool-bbb';
const POST_1 = 'https://x.com/user/status/111111111';
const POST_2 = 'https://x.com/user/status/222222222';

suite('Same tweet submitted TWICE to the same pool → duplicate', () => {
  // First submission is already in DB
  const db = [{ poolId: POOL_A, postLink: POST_1 }];

  check(
    'second submission to same pool is a duplicate',
    checkPoolDedup(db, POOL_A, POST_1),
    'duplicate',
  );
});

suite('Same tweet submitted by a SECOND USER to the same pool → duplicate', () => {
  // The check is pool+postLink, not pool+participant+postLink
  // so a different participant submitting the same URL is also caught
  const db = [{ poolId: POOL_A, postLink: POST_1 }]; // first user submitted it

  check(
    'second user submitting same URL to same pool is rejected',
    checkPoolDedup(db, POOL_A, POST_1),
    'duplicate',
  );
});

suite('Same tweet submitted to a DIFFERENT pool → ok (allowed)', () => {
  // POST_1 exists in POOL_A, but we are submitting to POOL_B
  const db = [{ poolId: POOL_A, postLink: POST_1 }];

  check(
    'same URL in a different pool is allowed',
    checkPoolDedup(db, POOL_B, POST_1),
    'ok',
  );
});

suite('Different tweet submitted to the same pool → ok', () => {
  const db = [{ poolId: POOL_A, postLink: POST_1 }];

  check(
    'different URL in same pool is allowed',
    checkPoolDedup(db, POOL_A, POST_2),
    'ok',
  );
});

suite('Empty DB → ok', () => {
  check(
    'no existing posts — always ok',
    checkPoolDedup([], POOL_A, POST_1),
    'ok',
  );
});

suite('Multiple pools in DB, correct one found → duplicate', () => {
  const db = [
    { poolId: POOL_A, postLink: POST_2 },
    { poolId: POOL_B, postLink: POST_1 }, // POST_1 is in POOL_B
    { poolId: POOL_A, postLink: POST_1 }, // POST_1 is also in POOL_A
  ];

  check(
    'finds duplicate in correct pool',
    checkPoolDedup(db, POOL_A, POST_1),
    'duplicate',
  );
  check(
    'different pool is ok even when URL exists elsewhere',
    checkPoolDedup([{ poolId: POOL_B, postLink: POST_1 }], POOL_A, POST_1),
    'ok',
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
