/**
 * Server-side helpers for deploying and interacting with the GramketingPool smart contract.
 * All functions require ADMIN_MNEMONIC to be set in the environment.
 */

import { Address, beginCell, toNano, Dictionary, internal, SendMode, Cell } from '@ton/core';
import { TupleItemSlice } from '@ton/core';
import { createHash } from 'crypto';
import {
  GramketingPool,
  storeCreatePool,
  storeDistributeRewards,
  storeCancelPool,
} from '../contracts/output/gramketing_pool_GramketingPool';
import { getAdminWallet, getAdminKeypair, getTonClient, tonRetry, sleep } from './ton-admin';
import { getJettonWalletAddressViaTonApi } from './ton-balance';

// ── Jetton helpers ────────────────────────────────────────────────────────────

/**
 * Derives the jetton wallet address for a given owner using the jetton master's
 * `get_wallet_address` getter (standard TEP-74 method).
 */
export async function getJettonWalletAddress(
  jettonMasterAddress: string,
  ownerAddress: string,
): Promise<Address> {
  const client = getTonClient();
  const master = Address.parse(jettonMasterAddress);
  const owner = Address.parse(ownerAddress);

  const ownerCell = beginCell().storeAddress(owner).endCell();
  const result = await client.runMethod(master, 'get_wallet_address', [
    { type: 'slice', cell: ownerCell } as TupleItemSlice,
  ]);

  return result.stack.readAddress();
}

// Pre-computed SHA-256 keys for TEP-64 on-chain metadata dictionary.
// Dictionary keys are SHA-256 hashes of the UTF-8 attribute name.
function dictKey(name: string): bigint {
  return BigInt('0x' + createHash('sha256').update(name, 'utf8').digest('hex'));
}
const DECIMALS_DICT_KEY = dictKey('decimals');
const NAME_DICT_KEY     = dictKey('name');
const SYMBOL_DICT_KEY   = dictKey('symbol');
const IMAGE_DICT_KEY    = dictKey('image');
const URI_DICT_KEY      = dictKey('uri');    // hybrid format: on-chain dict with off-chain URI

/**
 * Fetches the jetton decimals from the jetton master's `get_jetton_data` getter.
 * Parses TEP-64 on-chain metadata (HashmapE 256 ^SnakeData) or fetches off-chain
 * JSON metadata. Falls back to 9 if the jetton master doesn't expose decimals.
 */
export async function getJettonDecimals(jettonMasterAddress: string): Promise<number> {
  try {
    const client = getTonClient();
    const master = Address.parse(jettonMasterAddress);

    // get_jetton_data returns: (total_supply, mintable, admin_address, content, wallet_code)
    const result = await client.runMethod(master, 'get_jetton_data', []);
    result.stack.readBigNumber();   // total_supply
    result.stack.readNumber();      // mintable
    result.stack.readAddressOpt();  // admin_address (may be addr_none when admin is burned)
    const contentCell = result.stack.readCell();

    const slice = contentCell.beginParse();
    if (slice.remainingBits < 8) return 9;
    const prefix = slice.loadUint(8);

    if (prefix === 0x00) {
      // On-chain metadata: HashmapE 256 ^SnakeData
      if (slice.remainingBits === 0 && slice.remainingRefs === 0) return 9;
      const dict = Dictionary.load(
        Dictionary.Keys.BigUint(256),
        Dictionary.Values.Cell(),
        slice,
      );
      // First try the `decimals` key directly in the on-chain dict
      const cell = dict.get(DECIMALS_DICT_KEY);
      if (cell) {
        const str = readSnakeString(cell).trim();
        const n = parseInt(str, 10);
        if (!isNaN(n) && n >= 0 && n <= 18) return n;
      }
      // Hybrid format: on-chain dict may only have a `uri` key pointing to off-chain JSON
      // (e.g. tokens that store decimals solely off-chain). Fall through to fetch that URI.
      const uriCell = dict.get(URI_DICT_KEY);
      if (uriCell) {
        const url = normalizeMetadataUrl(readSnakeString(uriCell).trim());
        if (url) {
          const n = await fetchOffChainDecimals(url);
          if (n !== null) return n;
        }
      }
    } else if (prefix === 0x01) {
      // Off-chain URL metadata - fetch JSON and read `decimals` field
      const url = normalizeMetadataUrl(slice.loadStringTail().trim());
      if (url) {
        const n = await fetchOffChainDecimals(url);
        if (n !== null) return n;
      }
    }
  } catch {
    // Fall through to default
  }
  return 9;
}

/**
 * Reads a snake-encoded UTF-8 string from a TEP-64 metadata value cell.
 * Skips the 0x00 snake-format prefix byte if present in the first cell.
 */
function readSnakeString(cell: Cell): string {
  let result = '';
  let current: Cell | null = cell;
  let isFirst = true;
  while (current) {
    const s = current.beginParse();
    const bytes = Math.floor(s.remainingBits / 8);
    if (bytes > 0) {
      const buf = s.loadBuffer(bytes);
      // Some implementations include a 0x00 snake-format prefix byte in the first cell
      const start = isFirst && buf[0] === 0x00 ? 1 : 0;
      result += buf.slice(start).toString('utf8');
    }
    isFirst = false;
    current = s.remainingRefs > 0 ? s.loadRef() : null;
  }
  return result;
}

function normalizeMetadataUrl(url: string): string {
  // Convert IPFS URIs to an HTTP gateway URL
  if (url.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + url.slice(7);
  return url;
}

async function fetchOffChainDecimals(url: string): Promise<number | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const json = await resp.json() as Record<string, unknown>;
    const n = parseInt(String(json?.decimals ?? ''), 10);
    if (!isNaN(n) && n >= 0 && n <= 18) return n;
    return null;
  } catch {
    return null;
  }
}

// ── Jetton metadata ───────────────────────────────────────────────────────────

export interface JettonMetadata {
  name: string;
  symbol: string;
  image: string;
}

/**
 * Fetches name, symbol, and image from a jetton master's TEP-64 metadata.
 * Handles both on-chain dictionary metadata (prefix 0x00) and off-chain JSON
 * URL metadata (prefix 0x01). Throws on network/parse failure.
 */
export async function getJettonMetadata(jettonMasterAddress: string): Promise<JettonMetadata> {
  const client = getTonClient();
  const master = Address.parse(jettonMasterAddress);

  const result = await client.runMethod(master, 'get_jetton_data', []);
  result.stack.readBigNumber();    // total_supply
  result.stack.readNumber();       // mintable
  result.stack.readAddressOpt();   // admin_address (may be addr_none when admin is burned)
  const contentCell = result.stack.readCell();

  const slice = contentCell.beginParse();
  if (slice.remainingBits < 8) throw new Error('Empty metadata content cell');
  const prefix = slice.loadUint(8);

  let name = '';
  let symbol = '';
  let image = '';

  if (prefix === 0x00) {
    // On-chain dictionary metadata (TEP-64 HashmapE 256 ^SnakeData)
    if (slice.remainingBits > 0 || slice.remainingRefs > 0) {
      const dict = Dictionary.load(
        Dictionary.Keys.BigUint(256),
        Dictionary.Values.Cell(),
        slice,
      );
      const nameCell   = dict.get(NAME_DICT_KEY);
      const symbolCell = dict.get(SYMBOL_DICT_KEY);
      const imageCell  = dict.get(IMAGE_DICT_KEY);
      if (nameCell)   name   = readSnakeString(nameCell).trim();
      if (symbolCell) symbol = readSnakeString(symbolCell).trim();
      if (imageCell)  image  = normalizeMetadataUrl(readSnakeString(imageCell).trim());

      // Hybrid format: some tokens (e.g. SENDIT) store only `decimals` + `uri`
      // in the on-chain dict and keep the rest of the metadata off-chain at
      // that URI. Fall through and fetch the URI if name/symbol are still missing.
      if (!name && !symbol) {
        const uriCell = dict.get(URI_DICT_KEY);
        if (uriCell) {
          const url = normalizeMetadataUrl(readSnakeString(uriCell).trim());
          const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (resp.ok) {
            const json = await resp.json() as Record<string, unknown>;
            name   = String(json?.name   ?? '').trim();
            symbol = String(json?.symbol ?? '').trim();
            const rawImage = String(json?.image ?? '').trim();
            if (rawImage && !image) image = normalizeMetadataUrl(rawImage);
          }
        }
      }
    }
  } else if (prefix === 0x01) {
    // Off-chain JSON URL metadata
    const url = normalizeMetadataUrl(slice.loadStringTail().trim());
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const json = await resp.json() as Record<string, unknown>;
      name   = String(json?.name   ?? '').trim();
      symbol = String(json?.symbol ?? '').trim();
      const rawImage = String(json?.image ?? '').trim();
      if (rawImage) image = normalizeMetadataUrl(rawImage);
    }
  }

  if (!name && !symbol) throw new Error('No name or symbol found in jetton metadata');
  return { name, symbol, image };
}

// ── Contract deployment ───────────────────────────────────────────────────────

/**
 * Deploys a new GramketingPool contract and sends the CreatePool initialization message.
 *
 * Returns the contract address (bounceable, url-safe) and the pool's jetton wallet address.
 */
export async function deployAndInitPool(params: {
  ownerAddress: string;
  adminAddress: string;
  jettonMasterAddress: string;
  totalReward: string;  // display amount (stored in DB) - informational in contract
  durationDays: number;
  rewardSlots: number;
  nonce: bigint;        // unique salt - use Date.now() or a DB pool ID hash
}): Promise<{ contractAddress: string; poolJettonWalletAddress: string }> {
  const { keyPair, contract: walletContract, client } = await getAdminWallet();

  const owner = Address.parse(params.ownerAddress);
  const admin = Address.parse(params.adminAddress);

  // ── Step 1: Compute deterministic contract address ──────────────────────────
  const poolContractInit = await GramketingPool.init(owner, admin, params.nonce);
  const contractAddr = new GramketingPool(
    // contractAddress() from @ton/core computes the address from stateInit
    (await import('@ton/core')).contractAddress(0, poolContractInit),
    poolContractInit,
  );

  const contractAddress = contractAddr.address;

  // Check if already deployed (idempotent)
  const existingState = await client.getContractState(contractAddress);
  if (existingState.state !== 'active') {
    // ── Step 2: Deploy (send stateInit + Deploy message) ───────────────────────
    const seqno = await walletContract.getSeqno();
    await walletContract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: contractAddress,
          value: toNano('0.15'), // gas for deployment + CreatePool
          init: poolContractInit,
          body: beginCell()
            .storeUint(2490013878, 32) // Deploy opcode (from Tact Deployable)
            .storeUint(0n, 64)         // queryId
            .endCell(),
          bounce: false,
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });

    // ── Step 3: Wait for contract to become active (max 60s) ───────────────────
    let active = false;
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      const state = await client.getContractState(contractAddress);
      if (state.state === 'active') { active = true; break; }
    }
    if (!active) throw new Error('Contract deployment timed out - check admin wallet balance');
  }

  // ── Step 4: Derive pool's jetton wallet address ─────────────────────────────
  const contractAddrStr = contractAddress.toString({ bounceable: true, urlSafe: true });
  const poolJettonWallet = await getJettonWalletAddress(params.jettonMasterAddress, contractAddrStr);
  const poolJettonWalletAddress = poolJettonWallet.toString({ bounceable: true, urlSafe: true });

  // ── Step 5: Send CreatePool message ────────────────────────────────────────
  // Only send if contract is freshly deployed (status=0, startTime=0)
  // to prevent double-initialization.
  const openPool = client.open(GramketingPool.fromAddress(contractAddress));
  const info = await openPool.getPoolInfo();

  if (info.startTime === 0n) {
    // Not yet initialized - send CreatePool
    // Fetch decimals so totalReward is stored in the contract in nano-token units
    // (the contract declares totalReward as `coins`, i.e. a nano-denomination integer).
    const decimals = await getJettonDecimals(params.jettonMasterAddress);
    const totalRewardBigInt = displayToNano(params.totalReward, decimals);

    const seqno = await walletContract.getSeqno();
    await walletContract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: contractAddress,
          value: toNano('0.05'),
          body: beginCell()
            .store(
              storeCreatePool({
                $$type: 'CreatePool',
                jettonWalletAddress: poolJettonWallet,
                totalReward: totalRewardBigInt,
                durationDays: BigInt(params.durationDays),
                rewardSlots: BigInt(params.rewardSlots),
              }),
            )
            .endCell(),
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    });
    // Fire-and-forget - will be processed within seconds
  }

  return { contractAddress: contractAddrStr, poolJettonWalletAddress };
}

// ── On-chain state reads ──────────────────────────────────────────────────────

/**
 * Fetches live pool state from the contract getter. Used as a pre-flight check
 * before distribution to verify depositedAmount > 0 and status == ENDED.
 */
export async function fetchOnChainPoolInfo(contractAddressStr: string) {
  const addr = Address.parse(contractAddressStr);
  return tonRetry(
    (c) => c.open(GramketingPool.fromAddress(addr)).getPoolInfo(),
    'fetchPoolInfo',
  );
}

// ── Distribution ──────────────────────────────────────────────────────────────

/**
 * Sends the DistributeRewards message to the pool contract from the admin wallet.
 * The contract will emit JettonTransfer messages to each winner's jetton wallet.
 *
 * Gas estimate: 0.07 TON per winner + 0.1 TON base.
 */
export async function sendDistributeRewards(
  contractAddressStr: string,
  winners: { walletAddress: string; shareBasisPoints: number }[],
): Promise<void> {
  const { keyPair, wallet } = await getAdminKeypair();

  const contractAddress = Address.parse(contractAddressStr);

  const winnersDict = Dictionary.empty(
    Dictionary.Keys.Address(),
    Dictionary.Values.BigInt(257),
  );
  // Parse and validate all addresses first so we get a named error, not a generic throw
  const parsedWinners = winners.map((w) => {
    let addr: Address;
    try {
      addr = Address.parse(w.walletAddress);
    } catch (e) {
      throw new Error(`Invalid TON address for winner: "${w.walletAddress}" - ${String(e)}`);
    }
    return { addr, shareBasisPoints: w.shareBasisPoints };
  });

  // Detect duplicates - bounceable and non-bounceable forms of the same wallet
  // normalise to the same key in the dictionary and silently overwrite each other.
  const seen = new Map<string, string>();
  for (const w of parsedWinners) {
    const canonical = `${w.addr.workChain}:${w.addr.hash.toString('hex')}`;
    if (seen.has(canonical)) {
      throw new Error(
        `Duplicate TON address in winners list: "${w.addr.toString()}" maps to the same ` +
        `on-chain key as "${seen.get(canonical)}" - fix the winners array before distributing`,
      );
    }
    seen.set(canonical, w.addr.toString());
    winnersDict.set(w.addr, BigInt(w.shareBasisPoints));
  }

  // Sanity-check: dict must have exactly as many entries as winners
  // (if this ever fails something changed in the Address key implementation)
  let dictSize = 0;
  for (const _ of winnersDict) { dictSize++; } // eslint-disable-line @typescript-eslint/no-unused-vars
  if (dictSize !== winners.length) {
    throw new Error(
      `Dictionary size mismatch after insert: expected ${winners.length}, got ${dictSize}. ` +
      `Some addresses may have collapsed to the same key.`,
    );
  }

  // Budget: 0.22 TON per winner (0.15 jetton send value + 0.07 contract execution) + 0.1 TON base
  const gasAmount = toNano('0.1') + BigInt(winners.length) * toNano('0.22');

  const body = beginCell()
    .store(storeDistributeRewards({ $$type: 'DistributeRewards', winners: winnersDict }))
    .endCell();

  const seqno = await tonRetry(c => c.open(wallet).getSeqno(), 'distribute/getSeqno');
  await tonRetry(
    c => c.open(wallet).sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [internal({ to: contractAddress, value: gasAmount, body })],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }),
    'distribute/sendTransfer',
  );
}

// ── End pool ──────────────────────────────────────────────────────────────────

/**
 * Sends the "endPool" string message to the pool contract from the admin wallet.
 * Transitions the pool status from ACTIVE to ENDED on-chain.
 */
export async function sendEndPool(contractAddressStr: string): Promise<void> {
  const { keyPair, wallet } = await getAdminKeypair();
  const contractAddress = Address.parse(contractAddressStr);

  const body = beginCell().storeUint(0, 32).storeStringTail('endPool').endCell();

  const seqno = await tonRetry(c => c.open(wallet).getSeqno(), 'endPool/getSeqno');
  await tonRetry(
    c => c.open(wallet).sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [internal({ to: contractAddress, value: toNano('0.05'), body })],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }),
    'endPool/sendTransfer',
  );
}

// ── Cancellation ─────────────────────────────────────────────────────────────

/**
 * Sends the CancelPool message to the pool contract from the admin wallet.
 * Winners receive their pro-rata share; the remainder is refunded to the pool owner.
 *
 * shareBasisPoints values should already be scaled to reflect only the participant
 * fraction (i.e. sum ≤ 10000 × daysElapsed/durationDays).
 */
export async function sendCancelPool(
  contractAddressStr: string,
  winners: { walletAddress: string; shareBasisPoints: number }[],
): Promise<void> {
  const { keyPair, wallet } = await getAdminKeypair();

  const contractAddress = Address.parse(contractAddressStr);

  const winnersDict = Dictionary.empty(
    Dictionary.Keys.Address(),
    Dictionary.Values.BigInt(257),
  );
  for (const winner of winners) {
    if (winner.shareBasisPoints > 0) {
      winnersDict.set(Address.parse(winner.walletAddress), BigInt(winner.shareBasisPoints));
    }
  }

  // Budget: 0.22 TON per winner (0.15 jetton send value + 0.07 contract execution) + 0.1 TON base + 0.22 for owner refund send
  const gasAmount = toNano('0.1') + BigInt(winners.length + 1) * toNano('0.22');

  const body = beginCell()
    .store(storeCancelPool({ $$type: 'CancelPool', winners: winnersDict }))
    .endCell();

  const seqno = await tonRetry(c => c.open(wallet).getSeqno(), 'cancelPool/getSeqno');
  await tonRetry(
    c => c.open(wallet).sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [internal({ to: contractAddress, value: gasAmount, body })],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }),
    'cancelPool/sendTransfer',
  );
}

// ── Platform fee transaction builders ────────────────────────────────────────

/**
 * Builds the TonConnect transaction parameters for paying the platform access
 * fee in TON. Sends the exact amount directly to TREASURY_WALLET_ADDRESS.
 *
 * The caller should call calculateFeeInTokens() first to get amountNano.
 */
export function buildFeeTransaction(params: {
  treasuryAddress: string;
  amountNano: bigint; // nanoTON
}): { to: string; amount: string } {
  // TonConnect SDK requires a user-friendly bounceable urlSafe address (EQ.../UQ...).
  // TREASURY_WALLET_ADDRESS may be a raw 0:hex or non-urlsafe base64 — normalize it.
  const to = Address.parse(params.treasuryAddress).toString({ bounceable: true, urlSafe: true });
  return {
    to,
    amount: params.amountNano.toString(),
  };
}

/**
 * Builds the TonConnect transaction parameters for paying the platform access
 * fee in a jetton (e.g. mGRAM). Sends from the sender's jetton wallet to the
 * treasury's jetton wallet via a standard TEP-74 transfer.
 */
export async function buildJettonFeeTransaction(params: {
  jettonMasterAddress: string;
  senderAddress: string;
  treasuryAddress: string;
  amountRaw: bigint; // in nano-tokens (already decimal-adjusted)
}): Promise<{
  to: string;    // sender's jetton wallet
  amount: string; // gas in nanoTON
  payload: string; // base64 BOC
}> {
  // Use TonAPI (reliable) instead of toncenter get_wallet_address (rate-limited).
  const senderJettonWalletRaw = await getJettonWalletAddressViaTonApi(
    params.senderAddress,
    params.jettonMasterAddress,
  );
  // Normalize all addresses before use — env vars and TonAPI may return raw 0:hex
  // or non-urlsafe base64 (EQ...+...) which Address.parse() would throw on without
  // the normalization step below.
  let senderJettonWallet: ReturnType<typeof Address.parse>;
  let treasuryAddr: ReturnType<typeof Address.parse>;
  let senderAddr: ReturnType<typeof Address.parse>;
  try { senderJettonWallet = Address.parse(senderJettonWalletRaw); }
  catch (e) { throw new Error(`Cannot parse sender jetton wallet address "${senderJettonWalletRaw}": ${e instanceof Error ? e.message : e}`); }
  try { treasuryAddr = Address.parse(params.treasuryAddress); }
  catch (e) { throw new Error(`Cannot parse treasury address "${params.treasuryAddress}": ${e instanceof Error ? e.message : e}`); }
  try { senderAddr = Address.parse(params.senderAddress); }
  catch (e) { throw new Error(`Cannot parse sender address "${params.senderAddress}": ${e instanceof Error ? e.message : e}`); }

  const body = beginCell()
    .storeUint(0x0f8a7ea5, 32)    // transfer opcode (TEP-74)
    .storeUint(0n, 64)             // queryId
    .storeCoins(params.amountRaw)  // amount in nano-tokens
    .storeAddress(treasuryAddr)    // destination = treasury
    .storeAddress(senderAddr)      // response_destination = sender (excess TON back)
    .storeBit(false)               // no custom_payload
    .storeCoins(toNano('0.02'))    // forward_ton_amount (notification gas)
    .storeBit(false)               // forward_payload = empty slice
    .endCell();

  return {
    to: senderJettonWallet.toString({ bounceable: true, urlSafe: true }),
    amount: toNano('0.12').toString(), // gas budget for jetton transfer
    payload: body.toBoc().toString('base64'),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts a decimal display-unit string (e.g. "1000" or "0.5") to the raw
 * integer nano-token amount without using floating-point arithmetic.
 *
 * Floating-point (parseFloat × Math.pow) loses precision beyond 2^53 ≈ 9×10^15,
 * which is crossed at ~9 M tokens for a 9-decimal token, or ~9 B tokens for a
 * 6-decimal token. This implementation works correctly for amounts up to 10^36.
 */
function displayToNano(displayAmount: string, decimals: number): bigint {
  const trimmed = displayAmount.trim();
  const dotIndex = trimmed.indexOf('.');
  let intPart: string;
  let fracPart: string;
  if (dotIndex === -1) {
    intPart = trimmed;
    fracPart = '';
  } else {
    intPart = trimmed.slice(0, dotIndex);
    fracPart = trimmed.slice(dotIndex + 1);
  }
  // Pad / truncate fractional part to exactly `decimals` digits
  const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
  const raw = (intPart || '0') + paddedFrac;
  // Remove leading zeros, but keep at least one digit
  return BigInt(raw.replace(/^0+(?=\d)/, '') || '0');
}

// ── Jetton deposit transaction builder ───────────────────────────────────────

/**
 * Builds the TonConnect transaction parameters for the pool creator to deposit
 * reward tokens into the escrow contract.
 *
 * The creator's wallet calls their own jetton wallet with a standard TEP-74
 * transfer message, routing tokens to the pool contract. The pool's jetton
 * wallet then notifies the pool contract via JettonTransferNotification.
 */
export async function buildDepositTransaction(params: {
  jettonMasterAddress: string;
  creatorWalletAddress: string;
  contractAddress: string;
  totalReward: string;   // display amount
  decimals: number;
}): Promise<{
  to: string;       // creator's jetton wallet address
  amount: string;   // gas in nanotons
  payload: string;  // base64 BOC of the jetton transfer message
}> {
  // Derive creator's own jetton wallet address
  const creatorJettonWallet = await getJettonWalletAddress(
    params.jettonMasterAddress,
    params.creatorWalletAddress,
  );

  const poolContractAddr = Address.parse(params.contractAddress);
  const creatorAddr = Address.parse(params.creatorWalletAddress);

  // Convert display amount to nano-tokens using the token's decimal places.
  // Uses integer arithmetic (displayToNano) to avoid float precision loss.
  const rawAmount = displayToNano(params.totalReward, params.decimals);

  // Standard TEP-74 jetton transfer message body
  // Opcode 0x0f8a7ea5 is sent to the creator's own jetton wallet, which routes
  // tokens to contractAddress and sends a 0x7362d09c notification to it.
  const body = beginCell()
    .storeUint(0x0f8a7ea5, 32)     // transfer opcode (TEP-74)
    .storeUint(0n, 64)              // queryId
    .storeCoins(rawAmount)          // amount in nano-tokens
    .storeAddress(poolContractAddr) // destination = pool contract
    .storeAddress(creatorAddr)      // response_destination = creator (excess TON back)
    .storeBit(false)                // no custom_payload
    .storeCoins(toNano('0.15'))     // forward_ton_amount (for notification gas - must be enough for contract execution)
    .storeBit(false)                // forward_payload = empty slice (inline)
    .endCell();

  return {
    to: creatorJettonWallet.toString({ bounceable: true, urlSafe: true }),
    amount: toNano('0.35').toString(), // gas budget: 0.15 forwardTonAmount + ~0.01 jetton wallet gas + buffer
    payload: body.toBoc().toString('base64'),
  };
}
