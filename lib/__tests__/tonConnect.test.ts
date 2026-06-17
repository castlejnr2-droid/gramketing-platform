/**
 * Unit tests for verifyTonProof.
 *
 * Run with:  npx ts-node --transpile-only lib/__tests__/tonConnect.test.ts
 *
 * Builds a synthetic but fully correct ton_proof using known Ed25519 keys and
 * a hand-crafted W5R1-style stateInit, then confirms acceptance and rejection paths.
 */

import { createHash } from 'crypto';
import { keyPairFromSeed, sign } from '@ton/crypto';
import { beginCell, contractAddress, Address } from '@ton/core';
import { verifyTonProof, TonProofAccount, TonProofData } from '../tonConnect';

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Wallet stateInit builders ─────────────────────────────────────────────────
// Each builder produces a minimal stateInit with the data cell layout used by
// the corresponding wallet contract.  The code cell is intentionally empty —
// these stateInits are only used for address derivation and key-extraction tests.

/** W5R1: sig_allowed(1) + seqno(32) + wallet_id(32) + pubkey(256) → key at bit 65 */
function buildW5R1StateInit(publicKey: Buffer) {
  const dataCell = beginCell()
    .storeInt(-1, 1)           // sig_allowed
    .storeUint(0, 32)          // seqno
    .storeUint(698983191, 32)  // wallet_id (32-bit)
    .storeBuffer(publicKey)    // pubkey at bit 65
    .storeBit(0)               // empty plugins dict
    .endCell();

  const codeCell = beginCell().endCell();
  return beginCell()
    .storeBit(0).storeBit(0)   // no split_depth, no special
    .storeBit(1).storeRef(codeCell)  // has code
    .storeBit(1).storeRef(dataCell)  // has data
    .storeBit(0)               // no library
    .endCell();
}

/** V4R2 / V3R2: seqno(32) + wallet_id(32) + pubkey(256) → key at bit 64 */
function buildV4R2StateInit(publicKey: Buffer) {
  const dataCell = beginCell()
    .storeUint(0, 32)          // seqno
    .storeUint(698983191, 32)  // subwallet_id (32-bit)
    .storeBuffer(publicKey)    // pubkey at bit 64
    .storeBit(0)               // empty plugins dict
    .endCell();

  const codeCell = beginCell().endCell();
  return beginCell()
    .storeBit(0).storeBit(0)
    .storeBit(1).storeRef(codeCell)
    .storeBit(1).storeRef(dataCell)
    .storeBit(0)
    .endCell();
}

/**
 * W5 with 64-bit wallet_id (Tonkeeper variant):
 *   sig_allowed(1) + seqno(32) + wallet_id(64) + pubkey(256) → key at bit 97
 *
 * This is the layout that was FAILING before the fix — the old offset table
 * only tried [65, 64] and would extract the wrong bytes at those offsets.
 */
function buildW5_64bitId_StateInit(publicKey: Buffer) {
  const dataCell = beginCell()
    .storeInt(-1, 1)                 // sig_allowed
    .storeUint(0, 32)                // seqno
    .storeUint(BigInt('0x29A9A31700000000'), 64)  // wallet_id as 64-bit
    .storeBuffer(publicKey)          // pubkey at bit 97
    .endCell();

  const codeCell = beginCell().endCell();
  return beginCell()
    .storeBit(0).storeBit(0)
    .storeBit(1).storeRef(codeCell)
    .storeBit(1).storeRef(dataCell)
    .storeBit(0)
    .endCell();
}

function buildProofMessage(params: {
  domain: string;
  workchain: number;
  addrHash: Buffer;
  timestamp: number;
  payload: string;
}): Buffer {
  const domainBytes  = Buffer.from(params.domain, 'utf8');
  const wcBuf        = Buffer.allocUnsafe(4); wcBuf.writeInt32BE(params.workchain);
  const domLenBuf    = Buffer.allocUnsafe(4); domLenBuf.writeUInt32LE(domainBytes.length);
  const tsBuf        = Buffer.allocUnsafe(8); tsBuf.writeBigUInt64LE(BigInt(params.timestamp));

  return Buffer.concat([
    Buffer.from('ton-proof-item-v2/', 'utf8'),
    wcBuf,
    params.addrHash,
    domLenBuf,
    domainBytes,
    tsBuf,
    Buffer.from(params.payload, 'utf8'),
  ]);
}

function buildSignedHash(message: Buffer): Buffer {
  const msgHash    = createHash('sha256').update(message).digest();
  const signInput  = Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from('ton-connect', 'utf8'),
    msgHash,
  ]);
  return createHash('sha256').update(signInput).digest();
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
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

// ── Build a valid proof fixture ───────────────────────────────────────────────

type StateInitBuilder = (pubKey: Buffer) => ReturnType<typeof buildW5R1StateInit>;

async function buildFixture(buildStateInit: StateInitBuilder = buildW5R1StateInit) {
  const seed    = Buffer.alloc(32, 0x42); // deterministic seed for reproducibility
  const kp      = keyPairFromSeed(seed);
  const pubKey  = Buffer.from(kp.publicKey);

  const stateInitCell = buildStateInit(pubKey);
  // Derive address from stateInit hash (workchain 0)
  const addr = Address.parseRaw(
    `0:${stateInitCell.hash().toString('hex')}`,
  );

  const domain    = 'gramketing.com';
  const timestamp = Math.floor(Date.now() / 1000) - 10; // 10 s ago (within TTL)
  const payload   = 'deadbeef'.repeat(8); // 64-char hex

  const message    = buildProofMessage({ domain, workchain: 0, addrHash: addr.hash, timestamp, payload });
  const signed     = buildSignedHash(message);
  const sigBuffer  = sign(signed, kp.secretKey);
  const signature  = Buffer.from(sigBuffer).toString('base64');

  const account: TonProofAccount = {
    address:         addr.toString(),
    chain:           '-239',
    walletStateInit: stateInitCell.toBoc().toString('base64'),
    publicKey:       pubKey.toString('hex'),
  };

  const proof: TonProofData = {
    timestamp,
    domain:    { lengthBytes: Buffer.byteLength(domain, 'utf8'), value: domain },
    payload,
    signature,
  };

  return { kp, pubKey, stateInitCell, account, proof };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\nverifyTonProof unit tests\n');

  const { account, proof, kp, pubKey, stateInitCell } = await buildFixture();

  await test('valid proof is accepted', async () => {
    const ok = await verifyTonProof(account, proof, 'gramketing.com');
    assert(ok, 'expected true for a correctly constructed proof');
  });

  await test('wrong domain is rejected', async () => {
    const ok = await verifyTonProof(account, proof, 'evil.com');
    assert(!ok, 'expected false for wrong domain');
  });

  await test('expired timestamp is rejected', async () => {
    const staleProof: TonProofData = {
      ...proof,
      timestamp: Math.floor(Date.now() / 1000) - 400, // > 5 min ago
    };
    const ok = await verifyTonProof(account, staleProof, 'gramketing.com');
    assert(!ok, 'expected false for stale timestamp');
  });

  await test('future timestamp (>TTL) is rejected', async () => {
    const futureProof: TonProofData = {
      ...proof,
      timestamp: Math.floor(Date.now() / 1000) + 400,
    };
    const ok = await verifyTonProof(account, futureProof, 'gramketing.com');
    assert(!ok, 'expected false for future timestamp outside window');
  });

  await test('tampered signature is rejected', async () => {
    const bad = Buffer.from(proof.signature, 'base64');
    bad[0] ^= 0xff; // flip first byte
    const tamperedProof: TonProofData = { ...proof, signature: bad.toString('base64') };
    const ok = await verifyTonProof(account, tamperedProof, 'gramketing.com');
    assert(!ok, 'expected false for tampered signature');
  });

  await test('wrong public key is rejected', async () => {
    const badAccount: TonProofAccount = {
      ...account,
      publicKey: Buffer.alloc(32, 0xde).toString('hex'), // different key
    };
    const ok = await verifyTonProof(badAccount, proof, 'gramketing.com');
    assert(!ok, 'expected false when publicKey does not match stateInit');
  });

  await test('missing walletStateInit is rejected', async () => {
    const badAccount: TonProofAccount = { ...account, walletStateInit: '' };
    const ok = await verifyTonProof(badAccount, proof, 'gramketing.com');
    assert(!ok, 'expected false when walletStateInit is empty');
  });

  await test('wrong address (stateInit hash mismatch) is rejected', async () => {
    const badAccount: TonProofAccount = {
      ...account,
      // Genuine stateInit but different claimed address — hash will not match
      address: 'EQ' + 'A'.repeat(46),
    };
    const ok = await verifyTonProof(badAccount, proof, 'gramketing.com');
    assert(!ok, 'expected false when claimed address does not match stateInit hash');
  });

  await test('tampered payload is rejected', async () => {
    const tamperedProof: TonProofData = { ...proof, payload: proof.payload.replace('d', 'e') };
    const ok = await verifyTonProof(account, tamperedProof, 'gramketing.com');
    assert(!ok, 'expected false for tampered payload');
  });

  // ── V4R2 wallet (pubkey at bit 64) ───────────────────────────────────────────

  await test('V4R2 wallet: valid proof accepted (pubkey at bit 64)', async () => {
    const f = await buildFixture(buildV4R2StateInit);
    const ok = await verifyTonProof(f.account, f.proof, 'gramketing.com');
    assert(ok, 'expected true for V4R2 wallet proof');
  });

  await test('V4R2 wallet: wrong pubkey is rejected', async () => {
    const f = await buildFixture(buildV4R2StateInit);
    const badAccount: TonProofAccount = {
      ...f.account,
      publicKey: Buffer.alloc(32, 0xab).toString('hex'), // attacker's key
    };
    const ok = await verifyTonProof(badAccount, f.proof, 'gramketing.com');
    assert(!ok, 'expected false: attacker key not in V4R2 stateInit');
  });

  // ── W5 with 64-bit wallet_id (pubkey at bit 97) — the regression case ────────

  await test('W5 64-bit wallet_id: valid proof accepted (pubkey at bit 97)', async () => {
    const f = await buildFixture(buildW5_64bitId_StateInit);
    const ok = await verifyTonProof(f.account, f.proof, 'gramketing.com');
    assert(ok, 'expected true for W5 64-bit wallet_id proof — this was the failing case before the fix');
  });

  await test('W5 64-bit wallet_id: wrong pubkey is rejected (security invariant)', async () => {
    const f = await buildFixture(buildW5_64bitId_StateInit);
    const badAccount: TonProofAccount = {
      ...f.account,
      publicKey: Buffer.alloc(32, 0xde).toString('hex'), // attacker claims a different key
    };
    const ok = await verifyTonProof(badAccount, f.proof, 'gramketing.com');
    assert(!ok, 'expected false: attacker key not present in stateInit at any offset');
  });

  await test('W5 64-bit wallet_id: tampered signature is rejected', async () => {
    const f = await buildFixture(buildW5_64bitId_StateInit);
    const bad = Buffer.from(f.proof.signature, 'base64');
    bad[0] ^= 0xff;
    const tamperedProof: TonProofData = { ...f.proof, signature: bad.toString('base64') };
    const ok = await verifyTonProof(f.account, tamperedProof, 'gramketing.com');
    assert(!ok, 'expected false for tampered signature on W5 64-bit wallet');
  });

  await test('W5 64-bit wallet_id: cross-layout address mismatch rejected', async () => {
    // Build a W5R1 (32-bit) account but verify against W5-64-bit stateInit — different hash
    const f64 = await buildFixture(buildW5_64bitId_StateInit);
    const fR1 = await buildFixture(buildW5R1StateInit);
    // Use the W5R1 stateInit but the W5-64 address — hash won't match
    const badAccount: TonProofAccount = {
      ...f64.account,
      walletStateInit: fR1.account.walletStateInit, // stateInit hash ≠ f64.account.address
    };
    const ok = await verifyTonProof(badAccount, f64.proof, 'gramketing.com');
    assert(!ok, 'expected false: stateInit hash does not match claimed address');
  });

  // Summary
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
