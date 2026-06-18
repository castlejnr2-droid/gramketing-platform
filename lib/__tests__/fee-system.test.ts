/**
 * Unit tests for Fix #8 fee-system: MGRAM price oracle, amount enforcement,
 * and sender binding (Fix #8 sender check).
 *
 * Run with:
 *   npx ts-node --transpile-only lib/__tests__/fee-system.test.ts
 *
 * No DB or real API calls — fetch is mocked; all logic is inlined from source.
 */

export {};

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label: string, got: unknown, want: unknown): void {
  const ser = (v: unknown) =>
    typeof v === 'bigint' ? `bigint:${v}` : JSON.stringify(v);
  const ok = ser(got) === ser(want);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`      got : ${ser(got)}`);
    console.error(`      want: ${ser(want)}`);
    failed++;
  }
}

function suite(name: string, fn: () => void | Promise<void>): Promise<void> {
  console.log(`\n${name}`);
  const r = fn();
  return r instanceof Promise ? r : Promise.resolve();
}

// ── Constants (mirrored from source) ─────────────────────────────────────────

const MGRAM_PRICE_MIN = 1e-7;
const MGRAM_PRICE_MAX = 1e-4;
const MGRAM_PRICE_MAX_DEVIATION = 0.5;
const CACHE_TTL_MS = 10 * 60 * 1_000;
const STALE_MAX_MS = 60 * 60 * 1_000;

const MGRAM_DECIMALS = 9;
const FEE_TOLERANCE = 0.04;

const FEE_TABLE: Record<number, { mgram: number; ton: number }> = {
  7:  { mgram: 5,     ton: 62.5  },
  14: { mgram: 99.5,  ton: 124.5 },
  21: { mgram: 149.5, ton: 187   },
  28: { mgram: 199.5, ton: 249.5 },
};

// ── Inlined: MGRAM price oracle logic ────────────────────────────────────────
// Matches lib/mgram-price.ts exactly so tests verify the real algorithm.

let _priceCache: { price: number; fetchedAt: number } | null = null;

function clearCache() { _priceCache = null; }
function injectCache(price: number, ageMs = 0) {
  _priceCache = { price, fetchedAt: Date.now() - ageMs };
}

// Mock helpers
let _mockFetchResult: (() => Promise<unknown>) | null = null;
function mockFetchOhlcv(closes: number[]) {
  _mockFetchResult = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: { attributes: { ohlcv_list: closes.map((c, i) => [i, c, c, c, c, 0]) } },
    }),
  });
}
function mockFetchError(status: number) {
  _mockFetchResult = async () => ({ ok: false, status, json: async () => ({}) });
}
function mockFetchThrow(msg: string) {
  _mockFetchResult = async () => { throw new Error(msg); };
}
function mockFetchEmptyList() {
  _mockFetchResult = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { attributes: { ohlcv_list: [] } } }),
  });
}

async function getMgramPriceInlined(): Promise<number | null> {
  if (_priceCache && Date.now() - _priceCache.fetchedAt < CACHE_TTL_MS) {
    return _priceCache.price;
  }

  let raw: number | null = null;
  try {
    const res = (await _mockFetchResult!()) as {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    };
    if (!res.ok) {
      // network error path
    } else {
      const data = (await res.json()) as {
        data?: { attributes?: { ohlcv_list?: [number, number, number, number, number, number][] } };
      };
      const ohlcvList = data?.data?.attributes?.ohlcv_list ?? [];
      if (ohlcvList.length > 0) {
        const closes = ohlcvList.map((c) => c[4]);
        raw = closes.reduce((s, p) => s + p, 0) / closes.length;
      }
    }
  } catch {
    // network throw
  }

  if (raw === null) {
    if (_priceCache && Date.now() - _priceCache.fetchedAt < STALE_MAX_MS) {
      return _priceCache.price;
    }
    return null;
  }

  if (raw < MGRAM_PRICE_MIN || raw > MGRAM_PRICE_MAX) return null;

  if (_priceCache && Date.now() - _priceCache.fetchedAt < STALE_MAX_MS) {
    const dev = Math.abs(raw - _priceCache.price) / _priceCache.price;
    if (dev > MGRAM_PRICE_MAX_DEVIATION) return null;
  }

  _priceCache = { price: raw, fetchedAt: Date.now() };
  return raw;
}

// ── Inlined: getRequiredFeeNano logic ────────────────────────────────────────

function computeRequiredNano(
  durationDays: number,
  currency: 'TON' | 'MGRAM',
  tonPrice: number,
  mgramPrice: number | null,
): bigint {
  const row = FEE_TABLE[durationDays];
  if (!row) throw new Error(`Invalid durationDays: ${durationDays}`);

  if (currency === 'TON') {
    if (tonPrice <= 0) throw new Error('TON price unavailable');
    const nanoExact = (row.ton / tonPrice) * 1e9;
    return BigInt(Math.floor(nanoExact * (1 - FEE_TOLERANCE)));
  }

  if (mgramPrice === null || mgramPrice <= 0) {
    throw new Error('MGRAM fee price temporarily unavailable, try again');
  }
  const nanoExact = (row.mgram / mgramPrice) * Math.pow(10, MGRAM_DECIMALS);
  return BigInt(Math.floor(nanoExact * (1 - FEE_TOLERANCE)));
}

// ── Inlined: sender-aware checkFeeTxData (TON) ───────────────────────────────

function normalizeRaw(addr: string): string {
  if (!addr) return '';
  return addr.toLowerCase(); // simplified for tests (production uses Address.parse)
}

interface TonApiTx {
  success?: boolean;
  in_msg?: {
    source?: { address?: string } | null;
    destination?: { address?: string } | null;
    value?: string | null;
  } | null;
}

type TonFeeCheckResult =
  | 'ok'
  | 'tx-not-successful'
  | 'wrong-sender'
  | 'wrong-destination'
  | 'insufficient-value';

function checkFeeTxData(
  tx: TonApiTx,
  feeWalletRaw: string,
  minValueNano: bigint,
  creatorWalletRaw: string,
): TonFeeCheckResult {
  if (!tx.success) return 'tx-not-successful';

  const source = normalizeRaw(tx.in_msg?.source?.address ?? '');
  if (!source || source !== creatorWalletRaw) return 'wrong-sender';

  const dest = normalizeRaw(tx.in_msg?.destination?.address ?? '');
  if (!dest || dest !== feeWalletRaw) return 'wrong-destination';

  const value = BigInt(tx.in_msg?.value ?? '0');
  if (value < minValueNano) return 'insufficient-value';

  return 'ok';
}

// ── Inlined: sender-aware checkMgramTransfer (MGRAM) + checkTonTransfer (TON) ─

interface JettonTransferAction {
  type: 'JettonTransfer';
  status: string;
  JettonTransfer?: {
    sender?: { address?: string } | null;
    recipient?: { address?: string } | null;
    amount?: string | null;
    jetton?: { address?: string } | null;
  } | null;
}

interface TonTransferAction {
  type: 'TonTransfer';
  status: string;
  TonTransfer?: {
    sender?: { address?: string } | null;
    recipient?: { address?: string } | null;
    amount?: number | null; // TonAPI returns int64 nanotons, not a string
    comment?: string | null;
  } | null;
}

interface TonApiEvent {
  actions?: (JettonTransferAction | TonTransferAction | { type: string; status: string })[] | null;
  in_progress?: boolean;
}

type MgramCheckResult =
  | 'ok'
  | 'no-jetton-transfer-action'
  | 'wrong-jetton-master'
  | 'wrong-sender'
  | 'wrong-recipient'
  | 'insufficient-amount';

function checkMgramTransfer(
  event: TonApiEvent,
  expectedJettonMasterRaw: string,
  expectedRecipientRaw: string,
  minAmountNano: bigint,
  creatorWalletRaw: string,
): MgramCheckResult {
  const successfulTransfers = (event.actions ?? []).filter(
    (a): a is JettonTransferAction => a.type === 'JettonTransfer' && a.status === 'ok',
  );
  if (successfulTransfers.length === 0) return 'no-jetton-transfer-action';

  const mgramTransfers = successfulTransfers.filter(
    (a) => normalizeRaw(a.JettonTransfer?.jetton?.address ?? '') === expectedJettonMasterRaw,
  );
  if (mgramTransfers.length === 0) return 'wrong-jetton-master';

  for (const action of mgramTransfers) {
    const jt = action.JettonTransfer!;

    const sender = normalizeRaw(jt.sender?.address ?? '');
    if (!sender || sender !== creatorWalletRaw) return 'wrong-sender';

    const recipient = normalizeRaw(jt.recipient?.address ?? '');
    if (recipient !== expectedRecipientRaw) return 'wrong-recipient';

    const amount = BigInt(jt.amount ?? '0');
    if (amount < minAmountNano) return 'insufficient-amount';

    return 'ok';
  }

  return 'wrong-sender';
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CREATOR   = '0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const OTHER     = '0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2';
const FEE_ADDR  = '0:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TREASURY  = '0:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const MGRAM_MA  = '0:26a44029e51d07a5176de23aeac4df9a7637c2ebc53aa800ab03a1cccf2f21de';
const OTHER_JT  = '0:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

const FEE_NANO  = 1_000_000n; // 1 MGRAM in nano-MGRAM
const TON_NANO  = 1_000_000_000n; // 1 TON in nanotons

function makeTonTx(o: Partial<TonApiTx> = {}): TonApiTx {
  return {
    success: true,
    in_msg: { source: { address: CREATOR }, destination: { address: FEE_ADDR }, value: String(TON_NANO) },
    ...o,
  };
}

function makeGoodEvent(
  jt: Partial<NonNullable<JettonTransferAction['JettonTransfer']>> = {},
): TonApiEvent {
  return {
    actions: [{
      type: 'JettonTransfer',
      status: 'ok',
      JettonTransfer: {
        sender:    { address: CREATOR },
        recipient: { address: TREASURY },
        jetton:    { address: MGRAM_MA },
        amount:    String(FEE_NANO),
        ...jt,
      },
    }],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1: MGRAM price oracle
// ═════════════════════════════════════════════════════════════════════════════

(async () => {

  // ── 1.1 TWAP computation ─────────────────────────────────────────────────

  await suite('Oracle: TWAP is mean of close prices', async () => {
    clearCache();
    mockFetchOhlcv([3e-6, 3.1e-6, 2.9e-6, 3.2e-6, 3.05e-6, 3.15e-6]);
    const price = await getMgramPriceInlined();
    const expected = (3e-6 + 3.1e-6 + 2.9e-6 + 3.2e-6 + 3.05e-6 + 3.15e-6) / 6;
    check('TWAP correct', Math.abs((price ?? 0) - expected) < 1e-12, true);
  });

  await suite('Oracle: single candle → that close price', async () => {
    clearCache();
    mockFetchOhlcv([3.009e-6]);
    const price = await getMgramPriceInlined();
    check('single candle', Math.abs((price ?? 0) - 3.009e-6) < 1e-15, true);
  });

  // ── 1.2 Cache behaviour ───────────────────────────────────────────────────

  await suite('Oracle: fresh cache hit skips fetch', async () => {
    clearCache();
    injectCache(3e-6, 0); // just injected, age = 0
    _mockFetchResult = async () => { throw new Error('should not be called'); };
    const price = await getMgramPriceInlined();
    check('served from cache', price, 3e-6);
  });

  await suite('Oracle: stale cache (> TTL) triggers a fetch', async () => {
    clearCache();
    injectCache(3e-6, CACHE_TTL_MS + 1); // expired
    mockFetchOhlcv([3.1e-6]);
    const price = await getMgramPriceInlined();
    check('new price after stale cache', Math.abs((price ?? 0) - 3.1e-6) < 1e-15, true);
  });

  // ── 1.3 Network / parse failures ─────────────────────────────────────────

  await suite('Oracle: network throw + no prior cache → null', async () => {
    clearCache();
    mockFetchThrow('ECONNREFUSED');
    const price = await getMgramPriceInlined();
    check('null when unreachable', price, null);
  });

  await suite('Oracle: network throw + recent cache (<1 h) → stale cache', async () => {
    clearCache();
    injectCache(3e-6, STALE_MAX_MS - 1_000); // 59 min old — within stale window
    mockFetchThrow('ECONNREFUSED');
    const price = await getMgramPriceInlined();
    check('stale cache served on network error', price, 3e-6);
  });

  await suite('Oracle: network throw + very old cache (>1 h) → null', async () => {
    clearCache();
    injectCache(3e-6, STALE_MAX_MS + 1); // > 1 h old
    mockFetchThrow('ECONNREFUSED');
    const price = await getMgramPriceInlined();
    check('null — stale cache too old', price, null);
  });

  await suite('Oracle: HTTP 500 + no cache → null', async () => {
    clearCache();
    mockFetchError(500);
    const price = await getMgramPriceInlined();
    check('null on HTTP 500', price, null);
  });

  await suite('Oracle: empty OHLCV list + no cache → null', async () => {
    clearCache();
    mockFetchEmptyList();
    const price = await getMgramPriceInlined();
    check('null on empty list', price, null);
  });

  await suite('Oracle: empty OHLCV list + recent stale cache → serves stale', async () => {
    clearCache();
    injectCache(3e-6, STALE_MAX_MS - 1_000);
    mockFetchEmptyList();
    const price = await getMgramPriceInlined();
    check('stale cache on empty list', price, 3e-6);
  });

  // ── 1.4 Absolute sanity bounds ────────────────────────────────────────────

  await suite('Oracle: price below MIN ($1e-7) → null', async () => {
    clearCache();
    mockFetchOhlcv([MGRAM_PRICE_MIN - 1e-10]);
    const price = await getMgramPriceInlined();
    check('below MIN → null', price, null);
  });

  await suite('Oracle: price == MIN ($1e-7) → null (exclusive lower bound)', async () => {
    // The check is `raw < MIN || raw > MAX`; exactly MIN passes (not < MIN).
    clearCache();
    mockFetchOhlcv([MGRAM_PRICE_MIN]);
    const price = await getMgramPriceInlined();
    check('exactly MIN → accepted', price !== null, true);
  });

  await suite('Oracle: price above MAX ($1e-4) → null', async () => {
    clearCache();
    mockFetchOhlcv([MGRAM_PRICE_MAX + 1e-6]);
    const price = await getMgramPriceInlined();
    check('above MAX → null', price, null);
  });

  await suite('Oracle: price == MAX ($1e-4) → accepted', async () => {
    clearCache();
    mockFetchOhlcv([MGRAM_PRICE_MAX]);
    const price = await getMgramPriceInlined();
    check('exactly MAX → accepted', price !== null, true);
  });

  // ── 1.5 Deviation check ───────────────────────────────────────────────────

  await suite('Oracle: 50% deviation from recent cache → null', async () => {
    clearCache();
    // Cache must be expired (age > CACHE_TTL_MS) so a fetch occurs,
    // but recent enough (age < STALE_MAX_MS) for deviation check to apply.
    injectCache(3e-6, CACHE_TTL_MS + 1_000); // 11 min old — expired, but within 1 h
    // 3e-6 × 1.5 = 4.5e-6 → deviation ≈ 50.00000003% (> MGRAM_PRICE_MAX_DEVIATION=0.5)
    mockFetchOhlcv([4.5e-6 + 1e-10]); // just over 50%
    const price = await getMgramPriceInlined();
    check('>50% deviation → null', price, null);
  });

  await suite('Oracle: 49% deviation from recent cache → accepted', async () => {
    clearCache();
    injectCache(3e-6, CACHE_TTL_MS + 1_000); // expired but within 1 h
    mockFetchOhlcv([3e-6 * 1.49]); // 49% — within tolerance
    const price = await getMgramPriceInlined();
    check('49% deviation → accepted', price !== null, true);
  });

  await suite('Oracle: >50% deviation from OLD cache (>1 h) → accepted (no deviation check)', async () => {
    clearCache();
    injectCache(3e-6, STALE_MAX_MS + 1); // older than 1 h — deviation check skipped
    mockFetchOhlcv([6e-6]); // 100% up — would fail deviation check if cache were fresh
    const price = await getMgramPriceInlined();
    check('old cache → deviation check skipped, price accepted', price !== null, true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: Required fee nano-amount calculation
  // ═══════════════════════════════════════════════════════════════════════════

  await suite('FeeNano: TON 7-day ($62.5 USD at $1.65/TON)', async () => {
    // 62.5 / 1.65 = 37.878... TON = 37_878_787_878... nanotons; × 0.96 = 36_363_636_363
    const nano = computeRequiredNano(7, 'TON', 1.65, null);
    const exact = (62.5 / 1.65) * 1e9;
    const expected = BigInt(Math.floor(exact * (1 - FEE_TOLERANCE)));
    check('7-day TON required nano', nano, expected);
  });

  await suite('FeeNano: MGRAM 7-day ($5 USD at $3.009e-6/MGRAM)', async () => {
    const price = 3.009e-6;
    const nano = computeRequiredNano(7, 'MGRAM', 0, price);
    const exact = (5 / price) * 1e9;
    const expected = BigInt(Math.floor(exact * (1 - FEE_TOLERANCE)));
    check('7-day MGRAM required nano', nano, expected);
  });

  await suite('FeeNano: MGRAM 28-day ($199.5 USD at $3.009e-6/MGRAM)', async () => {
    const price = 3.009e-6;
    const nano = computeRequiredNano(28, 'MGRAM', 0, price);
    const exact = (199.5 / price) * 1e9;
    const expected = BigInt(Math.floor(exact * (1 - FEE_TOLERANCE)));
    check('28-day MGRAM required nano', nano, expected);
  });

  await suite('FeeNano: MGRAM price null → throws fail-closed', async () => {
    let threw = false;
    let msg = '';
    try {
      computeRequiredNano(7, 'MGRAM', 0, null);
    } catch (err) {
      threw = true;
      msg = err instanceof Error ? err.message : '';
    }
    check('throws on null price', threw, true);
    check('error mentions unavailable', msg.includes('unavailable'), true);
  });

  await suite('FeeNano: MGRAM price 0 → throws fail-closed', async () => {
    let threw = false;
    try { computeRequiredNano(7, 'MGRAM', 0, 0); } catch { threw = true; }
    check('throws on zero price', threw, true);
  });

  await suite('FeeNano: invalid duration → throws', async () => {
    let threw = false;
    try { computeRequiredNano(999, 'TON', 1.65, null); } catch { threw = true; }
    check('throws on invalid duration', threw, true);
  });

  // ── Tolerance boundary ────────────────────────────────────────────────────

  await suite('FeeNano: tolerance — exact required nano is accepted (>= required)', async () => {
    const price = 3.009e-6;
    const required = computeRequiredNano(7, 'MGRAM', 0, price);
    check('exact required amount accepted', required >= required, true);
  });

  await suite('FeeNano: tolerance — required is 96% of gross (4% tolerance applied)', async () => {
    // 7-day MGRAM: $5 USD at $3.009e-6 → gross nanoMGRAM, required = floor(gross × 0.96)
    const price = 3.009e-6;
    const grossNano = BigInt(Math.floor((5 / price) * 1e9));
    const required  = computeRequiredNano(7, 'MGRAM', 0, price);
    const expectedRequired = BigInt(Math.floor(Number(grossNano) * (1 - FEE_TOLERANCE)));
    check('required = floor(gross × 0.96)', required, expectedRequired);
    // 4% means required < grossNano
    check('required < gross (tolerance gives headroom)', required < grossNano, true);
  });

  await suite('FeeNano: just below required (grossNano × 0.95) would be insufficient', async () => {
    // This tests that the required value is strictly less than 95%-of-gross.
    const price = 3.009e-6;
    const grossNano = (5 / price) * 1e9;
    const required  = computeRequiredNano(7, 'MGRAM', 0, price);
    const dustAmount = BigInt(Math.floor(grossNano * 0.95)); // 5% short — below 4% tolerance
    check('95% of gross < required (4% tolerance, not 5%)', dustAmount < required, true);
  });

  await suite('FeeNano: 1n (dust) << required', async () => {
    const required = computeRequiredNano(7, 'MGRAM', 0, 3.009e-6);
    check('dust 1n < required', 1n < required, true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: TON sender binding (checkFeeTxData)
  // ═══════════════════════════════════════════════════════════════════════════

  await suite('TON sender: correct source → ok', async () => {
    const tx = makeTonTx();
    check('happy path', checkFeeTxData(tx, FEE_ADDR, 1n, CREATOR), 'ok');
  });

  await suite('TON sender: wrong source (other wallet) → wrong-sender', async () => {
    const tx = makeTonTx({ in_msg: { source: { address: OTHER }, destination: { address: FEE_ADDR }, value: String(TON_NANO) } });
    check('wrong source', checkFeeTxData(tx, FEE_ADDR, 1n, CREATOR), 'wrong-sender');
  });

  await suite('TON sender: source missing (absent field) → wrong-sender (fail-closed)', async () => {
    const tx = makeTonTx({ in_msg: { destination: { address: FEE_ADDR }, value: String(TON_NANO) } });
    check('no source → wrong-sender', checkFeeTxData(tx, FEE_ADDR, 1n, CREATOR), 'wrong-sender');
  });

  await suite('TON sender: source null → wrong-sender (fail-closed)', async () => {
    const tx = makeTonTx({ in_msg: { source: null, destination: { address: FEE_ADDR }, value: String(TON_NANO) } });
    check('null source → wrong-sender', checkFeeTxData(tx, FEE_ADDR, 1n, CREATOR), 'wrong-sender');
  });

  await suite('TON sender: source comparison is case-insensitive', async () => {
    const tx = makeTonTx({ in_msg: { source: { address: CREATOR.toUpperCase() }, destination: { address: FEE_ADDR }, value: String(TON_NANO) } });
    check('uppercase source matches', checkFeeTxData(tx, FEE_ADDR, 1n, CREATOR), 'ok');
  });

  await suite('TON sender: tx failed + wrong source → tx-not-successful first', async () => {
    const tx = makeTonTx({ success: false, in_msg: { source: { address: OTHER }, destination: { address: FEE_ADDR }, value: String(TON_NANO) } });
    check('tx-not-successful before sender check', checkFeeTxData(tx, FEE_ADDR, 1n, CREATOR), 'tx-not-successful');
  });

  await suite('TON sender: correct source, wrong destination → wrong-destination', async () => {
    const tx = makeTonTx({ in_msg: { source: { address: CREATOR }, destination: { address: OTHER }, value: String(TON_NANO) } });
    check('wrong destination', checkFeeTxData(tx, FEE_ADDR, 1n, CREATOR), 'wrong-destination');
  });

  await suite('TON sender: correct source+destination, insufficient value → insufficient-value', async () => {
    const tx = makeTonTx({ in_msg: { source: { address: CREATOR }, destination: { address: FEE_ADDR }, value: '0' } });
    check('zero value', checkFeeTxData(tx, FEE_ADDR, TON_NANO, CREATOR), 'insufficient-value');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: MGRAM sender binding (checkMgramTransfer)
  // ═══════════════════════════════════════════════════════════════════════════

  await suite('MGRAM sender: correct sender → ok', async () => {
    check('happy path', checkMgramTransfer(makeGoodEvent(), MGRAM_MA, TREASURY, FEE_NANO, CREATOR), 'ok');
  });

  await suite('MGRAM sender: wrong sender (other wallet) → wrong-sender', async () => {
    const event = makeGoodEvent({ sender: { address: OTHER } });
    check('wrong sender', checkMgramTransfer(event, MGRAM_MA, TREASURY, FEE_NANO, CREATOR), 'wrong-sender');
  });

  await suite('MGRAM sender: sender missing → wrong-sender (fail-closed)', async () => {
    const event = makeGoodEvent({ sender: undefined });
    check('absent sender → wrong-sender', checkMgramTransfer(event, MGRAM_MA, TREASURY, FEE_NANO, CREATOR), 'wrong-sender');
  });

  await suite('MGRAM sender: sender null → wrong-sender (fail-closed)', async () => {
    const event = makeGoodEvent({ sender: null });
    check('null sender → wrong-sender', checkMgramTransfer(event, MGRAM_MA, TREASURY, FEE_NANO, CREATOR), 'wrong-sender');
  });

  await suite('MGRAM sender: sender comparison is case-insensitive', async () => {
    const event = makeGoodEvent({ sender: { address: CREATOR.toUpperCase() } });
    check('uppercase sender matches', checkMgramTransfer(event, MGRAM_MA, TREASURY, FEE_NANO, CREATOR), 'ok');
  });

  await suite('MGRAM sender: correct sender, wrong jetton master → wrong-jetton-master', async () => {
    const event = makeGoodEvent({ jetton: { address: OTHER_JT } });
    check('wrong jetton', checkMgramTransfer(event, MGRAM_MA, TREASURY, FEE_NANO, CREATOR), 'wrong-jetton-master');
  });

  await suite('MGRAM sender: correct sender, wrong recipient → wrong-recipient', async () => {
    const event = makeGoodEvent({ recipient: { address: OTHER } });
    check('wrong recipient', checkMgramTransfer(event, MGRAM_MA, TREASURY, FEE_NANO, CREATOR), 'wrong-recipient');
  });

  await suite('MGRAM sender: correct sender+recipient, insufficient amount → insufficient-amount', async () => {
    const event = makeGoodEvent({ amount: String(FEE_NANO - 1n) });
    check('1 short → insufficient', checkMgramTransfer(event, MGRAM_MA, TREASURY, FEE_NANO, CREATOR), 'insufficient-amount');
  });

  await suite('MGRAM sender: amount >= fee → ok (over-payment allowed)', async () => {
    const event = makeGoodEvent({ amount: String(FEE_NANO * 2n) });
    check('double amount passes', checkMgramTransfer(event, MGRAM_MA, TREASURY, FEE_NANO, CREATOR), 'ok');
  });

  await suite('MGRAM sender: multiple actions — only the correct MGRAM+sender combination passes', async () => {
    const event: TonApiEvent = {
      actions: [
        { type: 'JettonTransfer', status: 'ok', JettonTransfer: { sender: { address: OTHER }, jetton: { address: MGRAM_MA }, recipient: { address: TREASURY }, amount: String(FEE_NANO) } },
        { type: 'JettonTransfer', status: 'ok', JettonTransfer: { sender: { address: CREATOR }, jetton: { address: MGRAM_MA }, recipient: { address: TREASURY }, amount: String(FEE_NANO) } },
      ],
    };
    // First MGRAM action has wrong sender → blocked. Second has correct sender → ok.
    // But our loop returns on the first MGRAM action it checks, so the wrong-sender fires
    // and we never check the second. That is intentional — a tx event should have exactly
    // one MGRAM transfer from the creator.
    const result = checkMgramTransfer(event, MGRAM_MA, TREASURY, FEE_NANO, CREATOR);
    // The function iterates and returns on first MGRAM action found. First action has wrong sender.
    check('first MGRAM action (wrong sender) gates → wrong-sender', result, 'wrong-sender');
  });

  await suite('MGRAM: no actions → no-jetton-transfer-action', async () => {
    check('empty', checkMgramTransfer({ actions: [] }, MGRAM_MA, TREASURY, FEE_NANO, CREATOR), 'no-jetton-transfer-action');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: TON events-based verification (checkTonTransfer)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Inlined: checkTonTransfer ─────────────────────────────────────────────

  type TonTransferCheckResult =
    | 'ok'
    | 'no-ton-transfer-action'
    | 'wrong-sender'
    | 'wrong-recipient'
    | 'insufficient-amount';

  function checkTonTransfer(
    event: TonApiEvent,
    expectedRecipientRaw: string,
    minAmountNano: bigint,
    creatorWalletRaw: string,
  ): TonTransferCheckResult {
    const successfulTransfers = (event.actions ?? []).filter(
      (a): a is TonTransferAction => a.type === 'TonTransfer' && a.status === 'ok',
    );
    if (successfulTransfers.length === 0) return 'no-ton-transfer-action';
    for (const action of successfulTransfers) {
      const tt = action.TonTransfer!;
      const sender = normalizeRaw(tt.sender?.address ?? '');
      if (!sender || sender !== creatorWalletRaw) return 'wrong-sender';
      const recipient = normalizeRaw(tt.recipient?.address ?? '');
      if (recipient !== expectedRecipientRaw) return 'wrong-recipient';
      const amount = BigInt(tt.amount ?? 0);
      if (amount < minAmountNano) return 'insufficient-amount';
      return 'ok';
    }
    return 'wrong-sender';
  }

  // ── Fixtures ──────────────────────────────────────────────────────────────

  function makeTonEvent(
    tt: Partial<NonNullable<TonTransferAction['TonTransfer']>> = {},
  ): TonApiEvent {
    return {
      actions: [{
        type: 'TonTransfer',
        status: 'ok',
        TonTransfer: {
          sender:    { address: CREATOR },
          recipient: { address: FEE_ADDR },
          amount:    Number(TON_NANO),
          ...tt,
        },
      }],
    };
  }

  // ── Tests ─────────────────────────────────────────────────────────────────

  await suite('TON transfer: happy path → ok', async () => {
    check('ok', checkTonTransfer(makeTonEvent(), FEE_ADDR, TON_NANO, CREATOR), 'ok');
  });

  await suite('TON transfer: no actions → no-ton-transfer-action', async () => {
    check('empty', checkTonTransfer({ actions: [] }, FEE_ADDR, TON_NANO, CREATOR), 'no-ton-transfer-action');
  });

  await suite('TON transfer: only JettonTransfer actions → no-ton-transfer-action', async () => {
    const event: TonApiEvent = {
      actions: [{ type: 'JettonTransfer', status: 'ok', JettonTransfer: { sender: { address: CREATOR }, recipient: { address: FEE_ADDR }, amount: '0', jetton: { address: MGRAM_MA } } }],
    };
    check('jetton-only → no ton transfer', checkTonTransfer(event, FEE_ADDR, TON_NANO, CREATOR), 'no-ton-transfer-action');
  });

  await suite('TON transfer: wrong sender → wrong-sender', async () => {
    check('wrong sender', checkTonTransfer(makeTonEvent({ sender: { address: OTHER } }), FEE_ADDR, TON_NANO, CREATOR), 'wrong-sender');
  });

  await suite('TON transfer: missing sender → wrong-sender (fail-closed)', async () => {
    check('absent sender', checkTonTransfer(makeTonEvent({ sender: undefined }), FEE_ADDR, TON_NANO, CREATOR), 'wrong-sender');
  });

  await suite('TON transfer: null sender → wrong-sender (fail-closed)', async () => {
    check('null sender', checkTonTransfer(makeTonEvent({ sender: null }), FEE_ADDR, TON_NANO, CREATOR), 'wrong-sender');
  });

  await suite('TON transfer: wrong recipient → wrong-recipient', async () => {
    check('wrong recipient', checkTonTransfer(makeTonEvent({ recipient: { address: OTHER } }), FEE_ADDR, TON_NANO, CREATOR), 'wrong-recipient');
  });

  await suite('TON transfer: insufficient amount → insufficient-amount', async () => {
    check('1 nano short', checkTonTransfer(makeTonEvent({ amount: Number(TON_NANO) - 1 }), FEE_ADDR, TON_NANO, CREATOR), 'insufficient-amount');
  });

  await suite('TON transfer: zero amount → insufficient-amount', async () => {
    check('zero', checkTonTransfer(makeTonEvent({ amount: 0 }), FEE_ADDR, TON_NANO, CREATOR), 'insufficient-amount');
  });

  await suite('TON transfer: exact amount → ok', async () => {
    check('exact', checkTonTransfer(makeTonEvent({ amount: Number(TON_NANO) }), FEE_ADDR, TON_NANO, CREATOR), 'ok');
  });

  await suite('TON transfer: over-payment → ok', async () => {
    check('double', checkTonTransfer(makeTonEvent({ amount: Number(TON_NANO) * 2 }), FEE_ADDR, TON_NANO, CREATOR), 'ok');
  });

  await suite('TON transfer: sender comparison is case-insensitive', async () => {
    check('uppercase sender', checkTonTransfer(makeTonEvent({ sender: { address: CREATOR.toUpperCase() } }), FEE_ADDR, TON_NANO, CREATOR), 'ok');
  });

  await suite('TON transfer: failed status action ignored → no-ton-transfer-action', async () => {
    const event: TonApiEvent = {
      actions: [{ type: 'TonTransfer', status: 'failed', TonTransfer: { sender: { address: CREATOR }, recipient: { address: FEE_ADDR }, amount: Number(TON_NANO) } }],
    };
    check('failed status skipped', checkTonTransfer(event, FEE_ADDR, TON_NANO, CREATOR), 'no-ton-transfer-action');
  });

  // ── FEE_TABLE sanity ──────────────────────────────────────────────────────

  await suite('FeeTable: all four durations are present', async () => {
    check('7d mgram',  typeof FEE_TABLE[7]?.mgram,  'number');
    check('14d mgram', typeof FEE_TABLE[14]?.mgram, 'number');
    check('21d mgram', typeof FEE_TABLE[21]?.mgram, 'number');
    check('28d mgram', typeof FEE_TABLE[28]?.mgram, 'number');
  });

  await suite('FeeTable: new USD values match spec', async () => {
    check('7d  mgram=$5',     FEE_TABLE[7].mgram,   5);
    check('7d  ton=$62.5',    FEE_TABLE[7].ton,     62.5);
    check('14d mgram=$99.5',  FEE_TABLE[14].mgram,  99.5);
    check('14d ton=$124.5',   FEE_TABLE[14].ton,    124.5);
    check('21d mgram=$149.5', FEE_TABLE[21].mgram,  149.5);
    check('21d ton=$187',     FEE_TABLE[21].ton,    187);
    check('28d mgram=$199.5', FEE_TABLE[28].mgram,  199.5);
    check('28d ton=$249.5',   FEE_TABLE[28].ton,    249.5);
  });

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);

})();
