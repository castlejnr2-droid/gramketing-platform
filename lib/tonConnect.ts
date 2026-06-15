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

    // 5. Extract public key from the stateInit data cell; must match proof publicKey
    const claimedPubKey  = Buffer.from(account.publicKey, 'hex');
    const embeddedPubKey = extractPublicKeyFromStateInit(stateInitCell);
    if (!embeddedPubKey) {
      console.warn('[verifyTonProof] could not extract public key from stateInit');
      return false;
    }
    if (!embeddedPubKey.equals(claimedPubKey)) {
      console.warn('[verifyTonProof] public key in stateInit does not match claimed publicKey');
      return false;
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
 * Extracts the Ed25519 public key from the wallet stateInit data cell.
 *
 * Supports the standard TON wallet versions:
 *   W5R1:  sig_allowed(1) + seqno(32) + wallet_id(32) + pubkey(256) → offset 65
 *   V4R2 / V3R2: seqno(32) + subwallet_id(32) + pubkey(256)         → offset 64
 *
 * Tries both offsets; returns whichever produces a 32-byte non-zero key,
 * or null if neither succeeds.
 */
function extractPublicKeyFromStateInit(stateInitCell: Cell): Buffer | null {
  try {
    const si = loadStateInit(stateInitCell.beginParse());
    if (!si.data) return null;

    const totalBits = si.data.bits.length;

    // Try W5R1 offset (65) then V4/V3 offset (64)
    for (const offset of [65, 64]) {
      if (totalBits < offset + 256) continue;
      try {
        const ds = si.data.beginParse();
        ds.skip(offset);
        const key = Buffer.from(ds.loadBuffer(32));
        // Sanity: reject all-zero keys
        if (!key.every((b) => b === 0)) return key;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── TonConnect manifest config (unchanged) ────────────────────────────────────

export const TON_CONNECT_MANIFEST = {
  url:     process.env.NEXT_PUBLIC_TONCONNECT_MANIFEST_URL ?? '',
  name:    'GRAMKETING',
  iconUrl: '/logo.png',
};
