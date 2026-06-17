/**
 * Unit tests for Fix #6: deposit & access-fee integrity.
 *
 * Run with:
 *   npx ts-node --transpile-only lib/__tests__/deposit.test.ts
 *
 * No DB or API calls — pure logic only, inlined from lib/ton-verify.ts.
 */

export {}; // module scope — prevents name collisions with other test files

// ── Inline helpers ────────────────────────────────────────────────────────────

/**
 * Simplified normalizer for tests: addresses are already in raw form (0:hexhex).
 * Production uses Address.parse().toRawString() from @ton/core to handle all
 * TON address representations (bounceable EQ…, non-bounceable UQ…, raw 0:…).
 */
function normalizeRaw(addr: string): string {
  if (!addr) return '';
  return addr.toLowerCase();
}

// ── Inlined from lib/ton-verify.ts: TON fee (checkFeeTxData) ─────────────────

interface TonApiTx {
  success?: boolean;
  in_msg?: {
    destination?: { address?: string } | null;
    value?: string | null;
  } | null;
}

type TonFeeCheckResult =
  | 'ok'
  | 'tx-not-successful'
  | 'wrong-destination'
  | 'insufficient-value';

function checkFeeTxData(
  tx: TonApiTx,
  feeWalletRaw: string,
  minValueNano: bigint,
): TonFeeCheckResult {
  if (!tx.success) return 'tx-not-successful';

  const dest = normalizeRaw(tx.in_msg?.destination?.address ?? '');
  if (!dest || dest !== feeWalletRaw) return 'wrong-destination';

  const value = BigInt(tx.in_msg?.value ?? '0');
  if (value < minValueNano) return 'insufficient-value';

  return 'ok';
}

// ── Inlined from lib/ton-verify.ts: MGRAM fee (checkMgramTransfer) ────────────

interface JettonTransferAction {
  type: string;
  status: string;
  JettonTransfer?: {
    recipient?: { address?: string } | null;
    amount?: string | null;
    jetton?: { address?: string } | null;
  } | null;
}

interface TonApiEvent {
  actions?: JettonTransferAction[] | null;
}

type MgramCheckResult =
  | 'ok'
  | 'no-jetton-transfer-action'
  | 'wrong-jetton-master'
  | 'wrong-recipient'
  | 'insufficient-amount';

function checkMgramTransfer(
  event: TonApiEvent,
  expectedJettonMasterRaw: string,
  expectedRecipientRaw: string,
  minAmountNano: bigint,
): MgramCheckResult {
  const successfulTransfers = (event.actions ?? []).filter(
    (a) => a.type === 'JettonTransfer' && a.status === 'ok',
  );

  if (successfulTransfers.length === 0) return 'no-jetton-transfer-action';

  const mgramTransfers = successfulTransfers.filter(
    (a) => normalizeRaw(a.JettonTransfer?.jetton?.address ?? '') === expectedJettonMasterRaw,
  );

  if (mgramTransfers.length === 0) return 'wrong-jetton-master';

  for (const action of mgramTransfers) {
    const jt = action.JettonTransfer!;
    const recipient = normalizeRaw(jt.recipient?.address ?? '');
    if (recipient !== expectedRecipientRaw) return 'wrong-recipient';

    const amount = BigInt(jt.amount ?? '0');
    if (amount < minAmountNano) return 'insufficient-amount';

    return 'ok';
  }

  return 'wrong-recipient';
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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FEE_WALLET       = '0:aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
const MGRAM_MASTER     = '0:26a44029e51d07a5176de23aeac4df9a7637c2ebc53aa800ab03a1cccf2f21de';
const TREASURY_WALLET  = '0:cafecafecafecafecafecafecafecafecafecafecafecafecafecafecafecafe';
const OTHER_JETTON     = '0:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const MIN_NANO         = 1n;
const FEE_AMOUNT       = 1_000_000n; // 1 MGRAM in nano-units

function makeTonTx(overrides: Partial<TonApiTx> = {}): TonApiTx {
  return {
    success: true,
    in_msg: { destination: { address: FEE_WALLET }, value: '1000000000' },
    ...overrides,
  };
}

function makeGoodEvent(overrides: Partial<JettonTransferAction['JettonTransfer']> = {}): TonApiEvent {
  return {
    actions: [{
      type: 'JettonTransfer',
      status: 'ok',
      JettonTransfer: {
        jetton:    { address: MGRAM_MASTER },
        recipient: { address: TREASURY_WALLET },
        amount:    String(FEE_AMOUNT),
        ...overrides,
      },
    }],
  };
}

// ── TON fee: checkFeeTxData ───────────────────────────────────────────────────

suite('TON: success=false → tx-not-successful', () => {
  check('rejected', checkFeeTxData(makeTonTx({ success: false }), FEE_WALLET, MIN_NANO), 'tx-not-successful');
});

suite('TON: success=undefined → tx-not-successful', () => {
  const tx: TonApiTx = { in_msg: { destination: { address: FEE_WALLET }, value: '1000000000' } };
  check('missing success rejected', checkFeeTxData(tx, FEE_WALLET, MIN_NANO), 'tx-not-successful');
});

suite('TON: wrong destination → wrong-destination', () => {
  const tx = makeTonTx({ in_msg: { destination: { address: '0:deadbeef' }, value: '1000000000' } });
  check('different address rejected', checkFeeTxData(tx, FEE_WALLET, MIN_NANO), 'wrong-destination');
});

suite('TON: null destination → wrong-destination', () => {
  const tx = makeTonTx({ in_msg: { destination: null, value: '1000000000' } });
  check('null destination rejected', checkFeeTxData(tx, FEE_WALLET, MIN_NANO), 'wrong-destination');
});

suite('TON: destination comparison is case-insensitive', () => {
  const tx = makeTonTx({ in_msg: { destination: { address: FEE_WALLET.toUpperCase() }, value: '1000000000' } });
  check('uppercase address matches', checkFeeTxData(tx, FEE_WALLET, MIN_NANO), 'ok');
});

suite('TON: value=0 → insufficient-value', () => {
  const tx = makeTonTx({ in_msg: { destination: { address: FEE_WALLET }, value: '0' } });
  check('zero value rejected', checkFeeTxData(tx, FEE_WALLET, MIN_NANO), 'insufficient-value');
});

suite('TON: value=null → insufficient-value', () => {
  const tx = makeTonTx({ in_msg: { destination: { address: FEE_WALLET }, value: null } });
  check('null value treated as 0', checkFeeTxData(tx, FEE_WALLET, MIN_NANO), 'insufficient-value');
});

suite('TON: value below explicit minimum → insufficient-value', () => {
  const min = 500_000_000n;
  const tx = makeTonTx({ in_msg: { destination: { address: FEE_WALLET }, value: '100000000' } });
  check('below min rejected', checkFeeTxData(tx, FEE_WALLET, min), 'insufficient-value');
});

suite('TON: canonical happy path → ok', () => {
  check('standard TON fee tx passes', checkFeeTxData(makeTonTx(), FEE_WALLET, MIN_NANO), 'ok');
});

// ── MGRAM fee: checkMgramTransfer ─────────────────────────────────────────────

suite('MGRAM: no actions → no-jetton-transfer-action', () => {
  check('empty actions rejected', checkMgramTransfer({ actions: [] }, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'no-jetton-transfer-action');
});

suite('MGRAM: actions=null → no-jetton-transfer-action', () => {
  check('null actions rejected', checkMgramTransfer({ actions: null }, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'no-jetton-transfer-action');
});

suite('MGRAM: action status=failed → no-jetton-transfer-action', () => {
  const event: TonApiEvent = { actions: [{ type: 'JettonTransfer', status: 'failed', JettonTransfer: { jetton: { address: MGRAM_MASTER }, recipient: { address: TREASURY_WALLET }, amount: String(FEE_AMOUNT) } }] };
  check('failed action rejected', checkMgramTransfer(event, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'no-jetton-transfer-action');
});

suite('MGRAM: WRONG jetton master → wrong-jetton-master', () => {
  const event = makeGoodEvent({ jetton: { address: OTHER_JETTON } });
  check('different token rejected', checkMgramTransfer(event, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'wrong-jetton-master');
});

suite('MGRAM: null jetton address → wrong-jetton-master', () => {
  const event = makeGoodEvent({ jetton: null });
  check('null jetton rejected', checkMgramTransfer(event, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'wrong-jetton-master');
});

suite('MGRAM: correct jetton, WRONG recipient → wrong-recipient', () => {
  const event = makeGoodEvent({ recipient: { address: '0:wrongwallet' } });
  check('wrong recipient rejected', checkMgramTransfer(event, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'wrong-recipient');
});

suite('MGRAM: correct jetton, null recipient → wrong-recipient', () => {
  const event = makeGoodEvent({ recipient: null });
  check('null recipient rejected', checkMgramTransfer(event, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'wrong-recipient');
});

suite('MGRAM: correct jetton+recipient, amount=0 (< fee) → insufficient-amount', () => {
  const event = makeGoodEvent({ amount: '0' });
  check('zero amount rejected', checkMgramTransfer(event, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'insufficient-amount');
});

suite('MGRAM: correct jetton+recipient, amount=fee-1 → insufficient-amount', () => {
  const event = makeGoodEvent({ amount: String(FEE_AMOUNT - 1n) });
  check('one short of fee rejected', checkMgramTransfer(event, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'insufficient-amount');
});

suite('MGRAM: correct jetton+recipient, amount=null → insufficient-amount', () => {
  const event = makeGoodEvent({ amount: null });
  check('null amount treated as 0', checkMgramTransfer(event, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'insufficient-amount');
});

suite('MGRAM: fully correct — right jetton, right recipient, amount==fee → ok', () => {
  check('canonical MGRAM fee tx passes', checkMgramTransfer(makeGoodEvent(), MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'ok');
});

suite('MGRAM: amount > fee → ok', () => {
  const event = makeGoodEvent({ amount: String(FEE_AMOUNT * 2n) });
  check('amount above fee passes', checkMgramTransfer(event, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'ok');
});

suite('MGRAM: address comparison is case-insensitive (normalized)', () => {
  const event = makeGoodEvent({
    jetton:    { address: MGRAM_MASTER.toUpperCase() },
    recipient: { address: TREASURY_WALLET.toUpperCase() },
    amount:    String(FEE_AMOUNT),
  });
  check('uppercase addresses match after normalize', checkMgramTransfer(event, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'ok');
});

suite('MGRAM: multiple actions — non-MGRAM skipped, correct MGRAM passes', () => {
  const event: TonApiEvent = {
    actions: [
      { type: 'TonTransfer', status: 'ok' },
      { type: 'JettonTransfer', status: 'ok', JettonTransfer: { jetton: { address: OTHER_JETTON }, recipient: { address: TREASURY_WALLET }, amount: '99999999' } },
      { type: 'JettonTransfer', status: 'ok', JettonTransfer: { jetton: { address: MGRAM_MASTER }, recipient: { address: TREASURY_WALLET }, amount: String(FEE_AMOUNT) } },
    ],
  };
  check('correct MGRAM transfer found among multiple actions', checkMgramTransfer(event, MGRAM_MASTER, TREASURY_WALLET, FEE_AMOUNT), 'ok');
});

// ── funded check: balance >= totalReward ──────────────────────────────────────

suite('funded check: balance >= totalReward → true', () => {
  function isFunded(balance: string, totalReward: string): boolean {
    return BigInt(balance) >= BigInt(totalReward);
  }

  check('balance == reward → funded',  isFunded('1000000', '1000000'), true);
  check('balance > reward → funded',   isFunded('2000000', '1000000'), true);
  check('balance < reward → not funded', isFunded('500000', '1000000'), false);
  check('balance = 0 → not funded',    isFunded('0', '1000000'),       false);
});

// ── PENDING → ACTIVE gate ─────────────────────────────────────────────────────

suite('join gate: PENDING → distinct error; ACTIVE → ok', () => {
  function joinGate(status: string): string {
    if (status === 'PENDING') return 'pool-not-yet-active';
    if (status !== 'ACTIVE') return 'pool-not-active';
    return 'ok';
  }

  check('PENDING → pool-not-yet-active',       joinGate('PENDING'),      'pool-not-yet-active');
  check('ENDED → pool-not-active',             joinGate('ENDED'),        'pool-not-active');
  check('DISTRIBUTED → pool-not-active',       joinGate('DISTRIBUTED'),  'pool-not-active');
  check('ACTIVE → ok',                         joinGate('ACTIVE'),       'ok');
});

suite('deposit-status: PENDING flips to ACTIVE only when funded', () => {
  function shouldActivate(funded: boolean, status: string): boolean {
    return funded && status === 'PENDING';
  }

  check('funded + PENDING → activate',          shouldActivate(true,  'PENDING'), true);
  check('not funded + PENDING → no-op',         shouldActivate(false, 'PENDING'), false);
  check('funded + ACTIVE → no-op',              shouldActivate(true,  'ACTIVE'),  false);
  check('funded + ENDED → no-op',               shouldActivate(true,  'ENDED'),   false);
});

// ── GET /api/pools: PENDING visibility filter ────────────────────────────────

suite('GET /api/pools: PENDING requires auth; scope is session wallet, NOT query param', () => {
  /**
   * Mirrors the filter logic in app/api/pools/route.ts GET handler.
   * authWallet  = result of getAuthWallet(req)  — from signed session, not spoofable
   * ownerParam  = req.searchParams.get('ownerAddress') — spoofable query param
   *
   * Returns the effective { status, ownerConstraint } that the DB query would use,
   * or '401' / 'excluded' for early-exit cases.
   */
  function poolsFilter(
    status: string | null,
    authWallet: string | null,   // session wallet (getAuthWallet result)
    ownerParam: string | null,   // spoofable query param (ignored for PENDING)
  ): string {
    if (status === 'PENDING') {
      if (!authWallet) return '401';
      // ownerParam is intentionally ignored — session wallet is authoritative
      return `status=PENDING scope=${authWallet}`;
    } else if (status && ['ACTIVE', 'ENDED', 'DISTRIBUTED'].includes(status)) {
      return ownerParam ? `status=${status} scope=${ownerParam}` : `status=${status}`;
    } else {
      return ownerParam ? `NOT-PENDING scope=${ownerParam}` : 'NOT-PENDING';
    }
  }

  // Default listing excludes PENDING regardless of ownerParam
  check('no status, no auth → excludes PENDING',
    poolsFilter(null, null, null), 'NOT-PENDING');
  check('no status + ownerParam → excludes PENDING (ownerParam is just a filter)',
    poolsFilter(null, null, '0:alice'), 'NOT-PENDING scope=0:alice');

  // PENDING requires auth
  check('PENDING + no auth → 401',
    poolsFilter('PENDING', null, null), '401');
  check('PENDING + no auth, ownerParam present → still 401 (param cannot substitute for auth)',
    poolsFilter('PENDING', null, '0:alice'), '401');

  // PENDING is scoped to session wallet, ownerParam is ignored
  check('PENDING + auth → scoped to session wallet',
    poolsFilter('PENDING', '0:alice', null), 'status=PENDING scope=0:alice');
  check('PENDING + auth + ownerParam=self → session wallet used, not param',
    poolsFilter('PENDING', '0:alice', '0:alice'), 'status=PENDING scope=0:alice');

  // KEY SECURITY CHECK: user B cannot see user A's PENDING pools
  check('user B (auth) + ownerParam=userA → scoped to userB, NOT userA',
    poolsFilter('PENDING', '0:userB', '0:userA'), 'status=PENDING scope=0:userB');

  // Non-PENDING status still accepts ownerParam for filtering (non-sensitive)
  check('ACTIVE + ownerParam → allowed',
    poolsFilter('ACTIVE', null, '0:alice'), 'status=ACTIVE scope=0:alice');
});

// ── Duplicate tx hash guard ───────────────────────────────────────────────────

suite('duplicate-hash guard: existing pool with same hash → 409', () => {
  function hashGuard(existingPoolId: string | null): string {
    return existingPoolId !== null ? 'conflict-409' : 'proceed';
  }

  check('hash already used → conflict',   hashGuard('some-pool-id'), 'conflict-409');
  check('hash not seen before → proceed', hashGuard(null),           'proceed');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
