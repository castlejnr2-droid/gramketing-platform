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
    source?: { address?: string } | null;      // sender wallet (present for internal TON transfers)
    destination?: { address?: string } | null;
    value?: string | null; // nanotons as decimal string
  } | null;
}

export type TonFeeCheckResult =
  | 'ok'
  | 'tx-not-successful'   // success !== true
  | 'wrong-sender'        // in_msg.source doesn't match authenticated creator wallet
  | 'wrong-destination'   // in_msg.destination doesn't match ADMIN_WALLET_ADDRESS
  | 'insufficient-value'; // in_msg.value below minimum

/**
 * Pure function: validates a raw TonAPI transaction for a TON fee payment.
 *
 * @param tx               Parsed TonAPI v2 transaction object
 * @param feeWalletRaw     Expected fee recipient in normalized raw form
 * @param minValueNano     Minimum nanoton value required
 * @param creatorWalletRaw Authenticated creator wallet in normalized raw form;
 *                         must match in_msg.source (fail-closed if source absent).
 *                         Note: payments routed through a proxy/intermediary will
 *                         fail this check — creators must send directly from their wallet.
 */
export function checkFeeTxData(
  tx: TonApiTx,
  feeWalletRaw: string,
  minValueNano: bigint,
  creatorWalletRaw: string,
): TonFeeCheckResult {
  if (!tx.success) return 'tx-not-successful';

  // Sender binding: in_msg.source must match the authenticated creator.
  // Absent source (e.g. external message edge cases) is treated as mismatch.
  const source = normalizeRaw(tx.in_msg?.source?.address ?? '');
  if (!source || source !== creatorWalletRaw) return 'wrong-sender';

  const dest = normalizeRaw(tx.in_msg?.destination?.address ?? '');
  if (!dest || dest !== feeWalletRaw) return 'wrong-destination';

  const value = BigInt(tx.in_msg?.value ?? '0');
  if (value < minValueNano) return 'insufficient-value';

  return 'ok';
}

// ── MGRAM fee: events-based jetton transfer check ─────────────────────────────

/** One action entry from TonAPI v2 /v2/events/{event_id} — jetton transfer. */
export interface JettonTransferAction {
  type: 'JettonTransfer';
  status: string; // "ok" | "failed"
  JettonTransfer?: {
    sender?: { address?: string } | null;    // sending wallet (bounceable EQ… form)
    recipient?: { address?: string } | null; // actual recipient wallet (raw)
    amount?: string | null;                  // jetton units as decimal string
    jetton?: { address?: string } | null;    // jetton master address (raw)
  } | null;
}

/** One action entry from TonAPI v2 /v2/events/{event_id} — plain TON transfer. */
export interface TonTransferAction {
  type: 'TonTransfer';
  status: string; // "ok" | "failed"
  TonTransfer?: {
    sender?: { address?: string } | null;    // sending wallet address (raw)
    recipient?: { address?: string } | null; // receiving wallet address (raw)
    amount?: number | null;                  // nanotons as integer (TonAPI returns int64)
    comment?: string | null;
  } | null;
}

/** Generic action — unknown types not used in fee verification. */
export interface UnknownAction {
  type: string;
  status: string;
}

/** Partial shape of a TonAPI v2 /v2/events/{event_id} response. */
export interface TonApiEvent {
  actions?: (JettonTransferAction | TonTransferAction | UnknownAction)[] | null;
  in_progress?: boolean; // true while the trace is still being indexed
}

export type MgramCheckResult =
  | 'ok'
  | 'no-jetton-transfer-action' // no successful JettonTransfer action in event
  | 'wrong-jetton-master'        // transfer found but for a different token contract
  | 'wrong-sender'               // correct token but sender ≠ authenticated creator wallet
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
 * @param creatorWalletRaw         Authenticated creator wallet, normalized raw lowercase;
 *                                 must match JettonTransfer.sender.address (fail-closed if absent)
 */
export function checkMgramTransfer(
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

  // Find a transfer whose jetton master matches MGRAM
  const mgramTransfers = successfulTransfers.filter(
    (a) => normalizeRaw(a.JettonTransfer?.jetton?.address ?? '') === expectedJettonMasterRaw,
  );

  if (mgramTransfers.length === 0) return 'wrong-jetton-master';

  // Among MGRAM transfers, verify sender, recipient, and amount in order
  for (const action of mgramTransfers) {
    const jt = action.JettonTransfer!;

    // Sender binding: JettonTransfer.sender.address (confirmed present in live TonAPI probe).
    // Absent sender is treated as mismatch (fail-closed).
    const sender = normalizeRaw(jt.sender?.address ?? '');
    if (!sender || sender !== creatorWalletRaw) return 'wrong-sender';

    const recipient = normalizeRaw(jt.recipient?.address ?? '');
    if (recipient !== expectedRecipientRaw) return 'wrong-recipient';

    const amount = BigInt(jt.amount ?? '0');
    if (amount < minAmountNano) return 'insufficient-amount';

    return 'ok';
  }

  // All MGRAM transfers had wrong sender
  return 'wrong-sender';
}

// ── TON transfer: events-based check ─────────────────────────────────────────

export type TonTransferCheckResult =
  | 'ok'
  | 'no-ton-transfer-action' // no successful TonTransfer action found in event
  | 'wrong-sender'           // transfer sender ≠ authenticated creator wallet
  | 'wrong-recipient'        // transfer recipient ≠ expected fee wallet
  | 'insufficient-amount';   // nanoton amount below minimum

/**
 * Pure function: validates a TonAPI event for a plain TON fee payment.
 *
 * Uses TonAPI's event trace (same /v2/events endpoint as MGRAM) rather than
 * /v2/blockchain/transactions, because the external message hash resolves to
 * the *sender's wallet* transaction — its in_msg.destination is the sender's
 * wallet, not the fee recipient.  The events endpoint follows the full trace
 * and exposes TonTransfer actions with the correct sender/recipient/amount.
 *
 * @param event              Parsed TonAPI v2 event object
 * @param expectedRecipientRaw  Fee wallet address, normalized raw lowercase
 * @param minAmountNano      Minimum nanotons required
 * @param creatorWalletRaw   Authenticated creator wallet, normalized raw lowercase
 */
export function checkTonTransfer(
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

    // TonAPI returns TonTransfer.amount as a number (int64 nanotons), not a string
    const amount = BigInt(tt.amount ?? 0);
    if (amount < minAmountNano) return 'insufficient-amount';

    return 'ok';
  }

  return 'wrong-sender';
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
 * @param txHash        Transaction hash provided by the pool creator
 * @param currency      'TON' or 'MGRAM'
 * @param minValueNano  Minimum amount in smallest units (nanotons for TON; jetton nano-units for MGRAM)
 * @param creatorWallet Authenticated creator wallet address (any TON representation);
 *                      normalized and matched against the on-chain sender field.
 */
export async function verifyAccessFeeTx(
  txHash: string,
  currency: 'TON' | 'MGRAM',
  minValueNano: bigint,
  creatorWallet: string,
): Promise<{ ok: boolean; error?: string }> {
  const endpoint = process.env.TONAPI_ENDPOINT ?? 'https://tonapi.io';
  if (!endpoint) return { ok: false, error: 'TONAPI_ENDPOINT not configured' };

  const creatorWalletRaw = normalizeRaw(creatorWallet);
  if (!creatorWalletRaw) return { ok: false, error: 'Creator wallet address missing or invalid' };

  if (currency === 'TON') {
    const feeWallet = process.env.ADMIN_WALLET_ADDRESS ?? '';
    const feeWalletRaw = normalizeRaw(feeWallet);
    if (!feeWalletRaw) return { ok: false, error: 'ADMIN_WALLET_ADDRESS not configured or invalid' };

    // Use /v2/events/{hash} (same as MGRAM) instead of /v2/blockchain/transactions/{hash}.
    // The external message hash resolves to the sender's wallet transaction on the raw
    // transactions endpoint; its in_msg.destination is the sender's wallet, not the fee
    // recipient.  The events endpoint follows the full trace and surfaces TonTransfer
    // actions with the correct sender/recipient/amount.
    let res: Response;
    try {
      res = await fetch(
        `${endpoint}/v2/events/${encodeURIComponent(txHash)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
    } catch (err) {
      return { ok: false, error: `TonAPI request failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    if (res.status === 404) return { ok: false, error: 'Transaction not found on-chain yet, please retry' };
    if (!res.ok) return { ok: false, error: `TonAPI returned ${res.status}` };

    let event: TonApiEvent;
    try {
      event = (await res.json()) as TonApiEvent;
    } catch {
      return { ok: false, error: 'TonAPI returned unparseable response' };
    }

    if (event.in_progress) {
      return { ok: false, error: 'Transaction still indexing, please retry in a few seconds' };
    }

    const result = checkTonTransfer(event, feeWalletRaw, minValueNano, creatorWalletRaw);
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

  if (res.status === 404) return { ok: false, error: 'Transaction not found on-chain yet, please retry' };
  if (!res.ok) return { ok: false, error: `TonAPI returned ${res.status}` };

  let event: TonApiEvent;
  try {
    event = (await res.json()) as TonApiEvent;
  } catch {
    return { ok: false, error: 'TonAPI returned unparseable response' };
  }

  if (event.in_progress) {
    return { ok: false, error: 'Transaction still indexing, please retry in a few seconds' };
  }

  const result = checkMgramTransfer(event, mgramMasterRaw, treasuryRaw, minValueNano, creatorWalletRaw);
  if (result === 'ok') return { ok: true };
  return { ok: false, error: result };
}
