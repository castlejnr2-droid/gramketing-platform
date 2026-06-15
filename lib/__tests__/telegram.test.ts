/**
 * Unit tests for validateTelegramInitData / extractTelegramUserId.
 *
 * Run with:
 *   TS_NODE_PROJECT=tsconfig.test.json npx ts-node --transpile-only lib/__tests__/telegram.test.ts
 */

import { createHmac } from 'crypto';
import { validateTelegramInitData, extractTelegramUserId } from '../telegram';

const BOT_TOKEN = 'test-bot-token-1234567890:ABCdef';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildInitData(
  params: Record<string, string>,
  opts: { overrideHash?: string } = {},
): string {
  const pairs = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = opts.overrideHash ??
    createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const all = new URLSearchParams({ ...params, hash });
  return all.toString();
}

function freshAuthDate(): string {
  return String(Math.floor(Date.now() / 1000) - 30); // 30 s ago
}

function staleAuthDate(): string {
  return String(Math.floor(Date.now() / 1000) - 7200); // 2 hours ago
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error('     ', err instanceof Error ? err.message : err);
    failed++;
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\nvalidateTelegramInitData unit tests\n');

  const userJson = JSON.stringify({ id: 123456789, first_name: 'Test', username: 'testuser' });

  await test('valid initData is accepted', () => {
    const initData = buildInitData({
      auth_date: freshAuthDate(),
      user:      userJson,
      query_id:  'AAHdF6IQAAAAAN0XohDhrOrc',
    });
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    assert(result !== null, 'expected non-null for valid initData');
  });

  await test('valid initData: extractTelegramUserId returns correct id', () => {
    const initData = buildInitData({
      auth_date: freshAuthDate(),
      user:      userJson,
    });
    const params = validateTelegramInitData(initData, BOT_TOKEN);
    assert(params !== null, 'validation failed unexpectedly');
    const id = extractTelegramUserId(params!);
    assert(id === '123456789', `expected '123456789', got '${id}'`);
  });

  await test('tampered hash is rejected', () => {
    const initData = buildInitData(
      { auth_date: freshAuthDate(), user: userJson },
      { overrideHash: 'deadbeef'.repeat(8) },
    );
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    assert(result === null, 'expected null for tampered hash');
  });

  await test('tampered payload (field value changed after signing) is rejected', () => {
    const initData = buildInitData({ auth_date: freshAuthDate(), user: userJson });
    // Flip one character in the user field value
    const tampered = initData.replace('testuser', 'eviluser');
    const result = validateTelegramInitData(tampered, BOT_TOKEN);
    assert(result === null, 'expected null for tampered field value');
  });

  await test('stale auth_date (>1 hour) is rejected', () => {
    const initData = buildInitData({ auth_date: staleAuthDate(), user: userJson });
    const result = validateTelegramInitData(initData, BOT_TOKEN);
    assert(result === null, 'expected null for stale auth_date');
  });

  await test('wrong bot token is rejected', () => {
    const initData = buildInitData({ auth_date: freshAuthDate(), user: userJson });
    const result = validateTelegramInitData(initData, 'wrong-token');
    assert(result === null, 'expected null for wrong bot token');
  });

  await test('missing hash field is rejected', () => {
    const params = new URLSearchParams({ auth_date: freshAuthDate(), user: userJson });
    const result = validateTelegramInitData(params.toString(), BOT_TOKEN);
    assert(result === null, 'expected null when hash is absent');
  });

  await test('empty initData string is rejected', () => {
    const result = validateTelegramInitData('', BOT_TOKEN);
    assert(result === null, 'expected null for empty string');
  });

  // Summary
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
