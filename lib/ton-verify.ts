/**
 * On-chain fee-transaction verification for pool creation.
 *
 * verifyAccessFeeTx    — async; reads env vars; hits TonAPI v2 REST
 * checkFeeTxData       — pure, testable; TON fee logic
 * checkMgramTransfer   — pure, testable; MGRAM jetton transfer logic
 *
 * TON fee:
 *   Uses /v2/blockchain/transactions/{hash}.
 *   Verifies in_msg.destination == ADMIN_WALLET_ADDRESS (fee recipient) and
 *   in_msg.value >= minimum.
 *
 * MGRAM fee:
 *   Uses /v2/events/{hash} (TonAPI structured event parsing).
 *   Verifies:
 *     1. A JettonTransfer action with status "ok" exists.
 *     2. The transferred jetton master == MGRAM_JETTON_MASTER_ADDRESS (env).
 *     3. The recipient wallet == TREASURY_WALLET_ADDRESS (env).
 *     4. The transferred amount >= required fee.
 *   All addresses are normalized to raw form (0:hexhex, lowercase) before
 *   comparison — TON addresses have multiple equivalent string representations
 *   (bounceable EQ…, non-bounceable UQ…, raw 0:…) and plain string equality
 *   gives false mismatches.
 */

import { Address } from '@ton/core';

// ── Address normalization ─────────────────────────────────────────────────────

/**
 * Normalizes any TON address representation to lowercase raw form "0:hexhex".
 * Returns '' on any parse error so callers can detect an unset/invalid address.
 */
export function normalizeRaw(addr: string): string {
  if (!addr) return '';
  try {
    return Address.parse(addr).toRawString().toLowerCase();
  } catch {
    return '';
  }
}

// ── TON fee: raw-transaction check ────────────────────────────────────────────

/** Partial shape of a TonAPI v2 /v2/blockchain/transactions/{hash} response. */
export interface TonApiTx {
  success?: boolean;
  in_msg?: {
    destination?: { address?: string } | null;
    value?: string | null; // nanotons as decimal string
  } | null;
}

export type TonFeeCheckResult =
  | 'ok'
  | 'tx-not-successful'   // success !== true
  | 'wrong-destination'   // in_msg.destination doesn't match ADMIN_WALLET_ADDRESS
  | 'insufficient-value'; // in_msg.value below minimum

/**
 * Pure function: validates a raw TonAPI transaction for a TON fee payment.
 *
 * @param tx             Parsed TonAPI v2 transaction object
 * @param feeWalletRaw   Expected fee recipient in normalized raw form
 * @param minValueNano   Minimum nanoton value required
 */
export function checkFeeTxData(
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

// ── MGRAM fee: events-based jetton transfer check ─────────────────────────────

/** One action entry from TonAPI v2 /v2/events/{event_id}. */
export interface JettonTransferAction {
  type: string;   // "JettonTransfer" | "TonTransfer" | …
  status: string; // "ok" | "failed"
  JettonTransfer?: {
    recipient?: { address?: string } | null; // actual recipient wallet (raw)
    amount?: string | null;                  // jetton units as decimal string
    jetton?: { address?: string } | null;    // jetton master address (raw)
  } | null;
}

/** Partial shape of a TonAPI v2 /v2/events/{event_id} response. */
export interface TonApiEvent {
  actions?: JettonTransferAction[] | null;
}

export type MgramCheckResult =
  | 'ok'
  | 'no-jetton-transfer-action' // no successful JettonTransfer action in event
  | 'wrong-jetton-master'        // transfer found but for a different token contract
  | 'wrong-recipient'            // correct token but recipient ≠ treasury wallet
  | 'insufficient-amount';       // correct token+recipient but amount below minimum

/**
 * Pure function: validates a TonAPI event for an MGRAM fee payment.
 *
 * All address parameters must already be normalized to lowercase raw form.
 * The function also normalizes addresses from the event response before comparing.
 *
 * @param event                  Parsed TonAPI v2 event object
 * @param expectedJettonMasterRaw  MGRAM master address, normalized raw lowercase
 * @param expectedRecipientRaw     Treasury wallet address, normalized raw lowercase
 * @param minAmountNano            Minimum jetton units required
 */
export function checkMgramTransfer(
  event: TonApiEvent,
  expectedJettonMasterRaw: string,
  expectedRecipientRaw: string,
  minAmountNano: bigint,
): MgramCheckResult {
  const successfulTransfers = (event.actions ?? []).filter(
    (a) => a.type === 'JettonTransfer' && a.status === 'ok',
  );

  if (successfulTransfers.length === 0) return 'no-jetton-transfer-action';

  // Find a transfer whose jetton master matches MGRAM
  const mgramTransfers = successfulTransfers.filter(
    (a) => normalizeRaw(a.JettonTransfer?.jetton?.address ?? '') === expectedJettonMasterRaw,
  );

  if (mgramTransfers.length === 0) return 'wrong-jetton-master';

  // Among MGRAM transfers, verify recipient and amount
  for (const action of mgramTransfers) {
    const jt = action.JettonTransfer!;
    const recipient = normalizeRaw(jt.recipient?.address ?? '');
    if (recipient !== expectedRecipientRaw) return 'wrong-recipient';

    const amount = BigInt(jt.amount ?? '0');
    if (amount < minAmountNano) return 'insufficient-amount';

    return 'ok';
  }

  // All MGRAM transfers went to wrong recipient
  return 'wrong-recipient';
}

// ── Async entry point ─────────────────────────────────────────────────────────

/**
 * Verifies an access-fee transaction on-chain.
 *
 * Reads configuration from env vars:
 *   TON fee:   ADMIN_WALLET_ADDRESS (fee recipient), TON_ENDPOINT
 *   MGRAM fee: MGRAM_JETTON_MASTER_ADDRESS, TREASURY_WALLET_ADDRESS, TON_ENDPOINT
 *
 * Returns { ok: true } when the fee is confirmed on-chain and passes all checks.
 * Returns { ok: false, error: string } on any failure. Never throws.
 *
 * @param txHash       Transaction hash provided by the pool creator
 * @param currency     'TON' or 'MGRAM'
 * @param minValueNano Minimum amount in smallest units (nanotons for TON; jetton nano-units for MGRAM)
 */
export async function verifyAccessFeeTx(
  txHash: string,
  currency: 'TON' | 'MGRAM',
  minValueNano: bigint,
): Promise<{ ok: boolean; error?: string }> {
  const endpoint = process.env.TONAPI_ENDPOINT ?? 'https://tonapi.io';
  if (!endpoint) return { ok: false, error: 'TONAPI_ENDPOINT not configured' };

  if (currency === 'TON') {
    const feeWallet = process.env.ADMIN_WALLET_ADDRESS ?? '';
    const feeWalletRaw = normalizeRaw(feeWallet);
    if (!feeWalletRaw) return { ok: false, error: 'ADMIN_WALLET_ADDRESS not configured or invalid' };

    let res: Response;
    try {
      res = await fetch(
        `${endpoint}/v2/blockchain/transactions/${encodeURIComponent(txHash)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
    } catch (err) {
      return { ok: false, error: `TonAPI request failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (res.status === 404) return { ok: false, error: 'Transaction not found on-chain' };
    if (!res.ok) return { ok: false, error: `TonAPI returned ${res.status}` };

    let tx: TonApiTx;
    try {
      tx = (await res.json()) as TonApiTx;
    } catch {
      return { ok: false, error: 'TonAPI returned unparseable response' };
    }

    const result = checkFeeTxData(tx, feeWalletRaw, minValueNano);
    if (result === 'ok') return { ok: true };
    return { ok: false, error: result };
  }

  // ── MGRAM branch ────────────────────────────────────────────────────────────

  const mgramMaster = process.env.MGRAM_JETTON_MASTER_ADDRESS ?? '';
  const treasury = process.env.TREASURY_WALLET_ADDRESS ?? '';

  const mgramMasterRaw = normalizeRaw(mgramMaster);
  const treasuryRaw = normalizeRaw(treasury);

  if (!mgramMasterRaw) return { ok: false, error: 'MGRAM_JETTON_MASTER_ADDRESS not configured or invalid' };
  if (!treasuryRaw) return { ok: false, error: 'TREASURY_WALLET_ADDRESS not configured or invalid' };

  // TonAPI v2 events provide structured JettonTransfer actions — far cleaner
  // than parsing raw message cells. The endpoint accepts the tx hash as event_id.
  let res: Response;
  try {
    res = await fetch(
      `${endpoint}/v2/events/${encodeURIComponent(txHash)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
  } catch (err) {
    return { ok: false, error: `TonAPI request failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (res.status === 404) return { ok: false, error: 'Transaction not found on-chain' };
  if (!res.ok) return { ok: false, error: `TonAPI returned ${res.status}` };

  let event: TonApiEvent;
  try {
    event = (await res.json()) as TonApiEvent;
  } catch {
    return { ok: false, error: 'TonAPI returned unparseable response' };
  }

  const result = checkMgramTransfer(event, mgramMasterRaw, treasuryRaw, minValueNano);
  if (result === 'ok') return { ok: true };
  return { ok: false, error: result };
}
