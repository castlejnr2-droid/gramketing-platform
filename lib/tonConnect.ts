// TON Connect ton_proof Ed25519 verification
// Spec: https://docs.ton.org/develop/dapps/ton-connect/sign

import { Address, Cell, loadStateInit } from '@ton/core';
import { signVerify } from '@ton/crypto';
import { createHash } from 'crypto';

// ── Public types ──────────────────────────────────────────────────────────────

export interface TonProofAccount {
  address: string;         // Any valid TON address format (UQ…, EQ…, 0:…)
  chain: string;           // '-239' mainnet | '-3' testnet
  walletStateInit: string; // base64-encoded StateInit BOC
  publicKey: string;       // hex-encoded 32-byte Ed25519 public key
}

export interface TonProofData {
  timestamp: number;       // Unix seconds the wallet signed at
  domain: { lengthBytes: number; value: string };
  payload: string;         // Server-issued nonce from GET /api/auth/challenge
  signature: string;       // base64-encoded 64-byte Ed25519 signature
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TON_PROOF_PREFIX   = 'ton-proof-item-v2/';
const TON_CONNECT_PREFIX = 'ton-connect';
const PROOF_TTL_SECONDS  = 300; // 5 minutes — reject stale proofs

// ── Main verifier ─────────────────────────────────────────────────────────────

/**
 * Verifies a TON Connect ton_proof per the official TON Connect spec.
 *
 * ALL of the following must pass before returning true:
 *   1. proof.domain.value matches expectedDomain
 *   2. proof.timestamp is within PROOF_TTL_SECONDS of now
 *   3. walletStateInit cell hash === Address.parse(account.address).hash
 *      (proves the stateInit belongs to the claimed address)
 *   4. The 32-byte Ed25519 public key embedded in the stateInit data cell
 *      matches account.publicKey
 *      (prevents an attacker using a foreign stateInit + their own key)
 *   5. Ed25519(signature, sha256(0xff0xff || "ton-connect" || sha256(message)), publicKey)
 *
 * Returns false on any failure; never throws to the caller.
 */
export async function verifyTonProof(
  account: TonProofAccount,
  proof: TonProofData,
  expectedDomain: string,
): Promise<boolean> {
  try {
    // 1. Domain
    if (proof.domain.value !== expectedDomain) {
      console.warn('[verifyTonProof] domain mismatch', {
        got: proof.domain.value,
        expected: expectedDomain,
      });
      return false;
    }

    // 2. Timestamp freshness
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - proof.timestamp) > PROOF_TTL_SECONDS) {
      console.warn('[verifyTonProof] proof timestamp outside window', {
        timestamp: proof.timestamp,
        now,
        delta: now - proof.timestamp,
      });
      return false;
    }

    // 3. Parse address → workchain + 32-byte hash
    const addr = Address.parse(account.address);
    const workchain = addr.workChain; // 0 for basechain
    const addrHash  = addr.hash;      // Buffer (32 bytes)

    // 4. Parse stateInit cell; verify its hash equals the address hash
    if (!account.walletStateInit) {
      console.warn('[verifyTonProof] walletStateInit is required');
      return false;
    }
    const stateInitCell = Cell.fromBase64(account.walletStateInit);
    const stateInitHash = stateInitCell.hash(); // Buffer (32 bytes) — TON cell hash
    if (!stateInitHash.equals(addrHash)) {
      console.warn('[verifyTonProof] stateInit hash does not match address');
      return false;
    }

    // 5. Confirm the claimed public key is present in the stateInit data cell.
    //    We scan all bit offsets rather than assuming a fixed layout, so all known
    //    wallet contracts are handled without hard-coded offset tables:
    //      V4R2 / V3R2  seqno(32) + wallet_id(32)       + pubkey → bit 64
    //      W5R1         sig_allowed(1) + seqno(32) + wallet_id(32)  + pubkey → bit 65
    //      W5 (64-bit wallet_id) sig_allowed(1) + seqno(32) + wallet_id(64) + pubkey → bit 97
    //    Acceptance is still EXACT equality — the scan only widens where we look,
    //    never what we accept.
    const claimedPubKey = Buffer.from(account.publicKey, 'hex');
    if (!stateInitContainsPublicKey(stateInitCell, claimedPubKey)) {
      return false; // debug details already logged inside
    }

    // 6. Build the signed message per the TON Connect ton_proof spec:
    //
    //    message =
    //      utf8("ton-proof-item-v2/")
    //      ++ int32 BE  workchain
    //      ++ 32 bytes  address hash
    //      ++ uint32 LE domain byte length
    //      ++ utf8      domain
    //      ++ uint64 LE timestamp
    //      ++ utf8      payload
    const domainBytes   = Buffer.from(proof.domain.value, 'utf8');
    const workchainBuf  = Buffer.allocUnsafe(4);
    workchainBuf.writeInt32BE(workchain);
    const domainLenBuf  = Buffer.allocUnsafe(4);
    domainLenBuf.writeUInt32LE(domainBytes.length);
    const timestampBuf  = Buffer.allocUnsafe(8);
    timestampBuf.writeBigUInt64LE(BigInt(proof.timestamp));

    const message = Buffer.concat([
      Buffer.from(TON_PROOF_PREFIX, 'utf8'),
      workchainBuf,
      addrHash,
      domainLenBuf,
      domainBytes,
      timestampBuf,
      Buffer.from(proof.payload, 'utf8'),
    ]);

    //    signed = sha256( 0xff 0xff ++ utf8("ton-connect") ++ sha256(message) )
    const messageHash = createHash('sha256').update(message).digest();
    const signedInput = Buffer.concat([
      Buffer.from([0xff, 0xff]),
      Buffer.from(TON_CONNECT_PREFIX, 'utf8'),
      messageHash,
    ]);
    const signed = createHash('sha256').update(signedInput).digest();

    // 7. Verify Ed25519 signature
    const signature = Buffer.from(proof.signature, 'base64');
    const valid = signVerify(signed, signature, claimedPubKey);
    if (!valid) {
      console.warn('[verifyTonProof] Ed25519 signature verification failed');
    }
    return valid;
  } catch (err) {
    console.error('[verifyTonProof] unexpected error:', err);
    return false;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns true if `claimedPubKey` (32 bytes) appears as a contiguous 256-bit
 * sequence at any bit offset within the stateInit's data cell, or within any
 * first-level reference cell of the data cell.
 *
 * This exhaustive scan handles all known wallet contract layouts without a
 * hard-coded offset table, including future layouts we haven't seen yet:
 *   V3R2 / V4R2  seqno(32) + wallet_id(32)                        + pubkey → bit 64
 *   W5R1         sig_allowed(1) + seqno(32) + wallet_id(32)        + pubkey → bit 65
 *   W5 (64-bit)  sig_allowed(1) + seqno(32) + wallet_id(64)        + pubkey → bit 97
 *
 * Security: acceptance is EXACT equality with claimedPubKey — the scan widens
 * where we look, never what we accept.  Combined with:
 *   • step 3: stateInit cell hash === Address.parse(account.address).hash
 *   • step 5: Ed25519 signature verification
 * an attacker cannot forge a stateInit that maps to the victim's address and
 * embeds the attacker's own key.
 *
 * Emits a structured debug warning on failure so unknown layouts can be
 * diagnosed from live logs without leaking any secret (public keys are public).
 */
function stateInitContainsPublicKey(
  stateInitCell: Cell,
  claimedPubKey: Buffer,
): boolean {
  try {
    const si = loadStateInit(stateInitCell.beginParse());
    if (!si.data) {
      console.warn('[verifyTonProof] stateInit has no data cell');
      return false;
    }

    // Cells to search: data cell first, then its first-level refs.
    const candidates: Array<{ label: string; cell: Cell }> = [
      { label: 'data', cell: si.data },
      ...si.data.refs.map((ref, i) => ({ label: `data.refs[${i}]`, cell: ref })),
    ];

    const searchLog: string[] = [];

    for (const { label, cell } of candidates) {
      const totalBits = cell.bits.length;
      if (totalBits < 256) {
        searchLog.push(`${label}(bits=${totalBits},skip:too_short)`);
        continue;
      }

      const maxOffset = totalBits - 256;
      searchLog.push(`${label}(bits=${totalBits},scan:0..${maxOffset})`);

      for (let offset = 0; offset <= maxOffset; offset++) {
        try {
          const ds = cell.beginParse();
          ds.skip(offset);
          const extracted = Buffer.from(ds.loadBuffer(32));
          if (extracted.equals(claimedPubKey)) {
            return true; // found — no logging needed
          }
        } catch {
          // Cell exhausted or parse error at this offset — stop scanning this cell.
          break;
        }
      }
    }

    // Key not found anywhere — log enough to diagnose the wallet layout.
    console.warn('[verifyTonProof] public key not found in stateInit', {
      claimedPublicKey: claimedPubKey.toString('hex'),
      dataCellBits:     si.data.bits.length,
      dataCellRefs:     si.data.refs.length,
      searched:         searchLog,
    });
    return false;
  } catch (err) {
    console.warn('[verifyTonProof] stateInit parse error',
      err instanceof Error ? err.message : String(err));
    return false;
  }
}

// ── TonConnect manifest config (unchanged) ────────────────────────────────────

export const TON_CONNECT_MANIFEST = {
  url:     process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL ?? '',
  name:    'GRAMKETING',
  iconUrl: '/logo.png',
};
