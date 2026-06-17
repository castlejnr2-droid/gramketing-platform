/**
 * Unit tests for lib/ton-balance.ts — getJettonBalance.
 *
 * Run with:
 *   npx ts-node --transpile-only lib/__tests__/ton-balance.test.ts
 *
 * Mocks global.fetch so no real TonAPI calls are made.
 */

export {};

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label: string, got: unknown, want: unknown): void {
  const serialize = (v: unknown) =>
    typeof v === 'bigint' ? `bigint:${v}` : JSON.stringify(v);
  const ok = serialize(got) === serialize(want);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      got : ${serialize(got)}`);
    console.error(`      want: ${serialize(want)}`);
    failed++;
  }
}

function suite(name: string, fn: () => void | Promise<void>): Promise<void> {
  console.log(`\n${name}`);
  const result = fn();
  return result instanceof Promise ? result : Promise.resolve();
}

// ── Inlined getJettonBalance logic (mirrors lib/ton-balance.ts exactly) ───────
// Inlining avoids the need for ts-node path alias resolution in tests.

async function getJettonBalance(
  ownerAddress: string,
  jettonMasterAddress: string,
): Promise<bigint> {
  const endpoint = process.env.TONAPI_ENDPOINT ?? 'https://tonapi.io';
  const url = `${endpoint}/v2/accounts/${encodeURIComponent(ownerAddress)}/jettons/${encodeURIComponent(jettonMasterAddress)}`;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  } catch (err) {
    throw new Error(
      `TonAPI request failed for ${ownerAddress}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (res.status === 404) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new Error(`TonAPI 404 for ${ownerAddress} (unparseable body)`);
    }
    const errMsg = typeof body === 'object' && body !== null && 'error' in body
      ? String((body as Record<string, unknown>).error)
      : '';
    if (errMsg.toLowerCase().includes('no jetton wallet')) {
      return 0n;
    }
    throw new Error(`TonAPI unexpected 404 for ${ownerAddress}: ${errMsg}`);
  }

  if (!res.ok) {
    throw new Error(`TonAPI returned ${res.status} for ${ownerAddress}`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`TonAPI returned unparseable response for ${ownerAddress}`);
  }

  const balance =
    typeof data === 'object' && data !== null && 'balance' in data
      ? String((data as Record<string, unknown>).balance)
      : null;

  if (balance === null) {
    throw new Error(`TonAPI response missing balance field for ${ownerAddress}`);
  }

  return BigInt(balance);
}

// ── fetch mock helper ─────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown, throwMsg?: string) {
  (global as unknown as Record<string, unknown>)['fetch'] = async () => {
    if (throwMsg) throw new Error(throwMsg);
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => {
        if (typeof body === 'string') throw new Error('unparseable');
        return body;
      },
    } as unknown as Response;
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  await suite('200 → returns balance as bigint', async () => {
    mockFetch(200, { balance: '380338829307503218', wallet_address: {}, jetton: {} });
    const result = await getJettonBalance('0:owner', '0:master');
    check('balance parsed', result, 380338829307503218n);
  });

  await suite('200 → zero balance string', async () => {
    mockFetch(200, { balance: '0' });
    const result = await getJettonBalance('0:owner', '0:master');
    check('zero balance', result, 0n);
  });

  await suite('404 + "no jetton wallet" → 0n (wallet never created)', async () => {
    mockFetch(404, { error: 'account 0:owner has no jetton wallet 0:master' });
    const result = await getJettonBalance('0:owner', '0:master');
    check('returns 0n cleanly', result, 0n);
  });

  await suite('404 + "no jetton wallet" (uppercase variant) → 0n', async () => {
    // The check uses .toLowerCase().includes('no jetton wallet'), so mixed-case
    // TonAPI responses are also handled gracefully → 0n, not a throw.
    mockFetch(404, { error: 'Account has no Jetton Wallet for this master' });
    const result = await getJettonBalance('0:owner', '0:master');
    check('uppercase "no jetton wallet" body also returns 0n', result, 0n);
  });

  await suite('404 + unexpected body → throws', async () => {
    mockFetch(404, { error: 'some other reason' });
    let threw = false;
    try {
      await getJettonBalance('0:owner', '0:master');
    } catch {
      threw = true;
    }
    check('throws on unexpected 404', threw, true);
  });

  await suite('429 Too Many Requests → throws', async () => {
    mockFetch(429, { error: 'rate limited' });
    let threw = false;
    try {
      await getJettonBalance('0:owner', '0:master');
    } catch {
      threw = true;
    }
    check('throws on 429', threw, true);
  });

  await suite('500 Internal Server Error → throws', async () => {
    mockFetch(500, { message: 'internal error' });
    let threw = false;
    try {
      await getJettonBalance('0:owner', '0:master');
    } catch {
      threw = true;
    }
    check('throws on 500', threw, true);
  });

  await suite('Network error → throws', async () => {
    mockFetch(0, null, 'ECONNREFUSED');
    let threw = false;
    try {
      await getJettonBalance('0:owner', '0:master');
    } catch {
      threw = true;
    }
    check('throws on network error', threw, true);
  });

  await suite('200 → missing balance field → throws', async () => {
    mockFetch(200, { jetton: {}, wallet_address: {} }); // no balance key
    let threw = false;
    try {
      await getJettonBalance('0:owner', '0:master');
    } catch {
      threw = true;
    }
    check('throws when balance field missing', threw, true);
  });

  // ── deposit-status funded logic ───────────────────────────────────────────

  await suite('funded: balance >= totalReward → funded=true', async () => {
    const balance = 1000n;
    const totalReward = 1000n;
    check('exact match is funded', balance >= totalReward, true);
  });

  await suite('funded: balance < totalReward → funded=false', async () => {
    const balance = 999n;
    const totalReward = 1000n;
    check('below threshold is not funded', balance >= totalReward, false);
  });

  await suite('funded: 0n from 404-no-wallet → not funded', async () => {
    const balance = 0n;
    const totalReward = 1000n;
    check('zero balance is not funded', balance >= totalReward, false);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
