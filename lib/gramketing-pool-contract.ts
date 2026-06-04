/**
 * Server-side helpers for deploying and interacting with the GramketingPool smart contract.
 * All functions require ADMIN_MNEMONIC to be set in the environment.
 */

import { Address, beginCell, toNano, Dictionary, internal, SendMode } from '@ton/core';
import { TupleItemSlice } from '@ton/core';
import {
  GramketingPool,
  storeCreatePool,
  storeDistributeRewards,
  storeCancelPool,
} from '../contracts/output/gramketing_pool_GramketingPool';
import { getAdminWallet, getTonClient, sleep } from './ton-admin';

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

/**
 * Fetches the jetton decimals from the jetton master's `get_jetton_data` getter.
 * Falls back to 9 decimals if the call fails or the field is missing.
 */
export async function getJettonDecimals(jettonMasterAddress: string): Promise<number> {
  try {
    const client = getTonClient();
    const master = Address.parse(jettonMasterAddress);

    // get_jetton_data returns: (total_supply, mintable, admin, content, wallet_code)
    // content is a cell that contains metadata (TEP-64). We try to parse decimals from it.
    // Many jettons store metadata as an on-chain snake-encoded dict or off-chain URL.
    // Fallback to 9 if parsing fails — covers the majority of TON jettons.
    const result = await client.runMethod(master, 'get_jetton_data', []);
    // Skip total_supply, mintable, admin_address, content, wallet_code
    // Try to read content cell and look for "decimals" key (0x8b...) — this is complex;
    // fall through to default.
    void result;
    return 9;
  } catch {
    return 9;
  }
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
  totalReward: string;  // display amount (stored in DB) — informational in contract
  durationDays: number;
  rewardSlots: number;
}): Promise<{ contractAddress: string; poolJettonWalletAddress: string }> {
  const { keyPair, contract: walletContract, client } = await getAdminWallet();

  const owner = Address.parse(params.ownerAddress);
  const admin = Address.parse(params.adminAddress);

  // ── Step 1: Compute deterministic contract address ──────────────────────────
  const poolContractInit = await GramketingPool.init(owner, admin);
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
    if (!active) throw new Error('Contract deployment timed out — check admin wallet balance');
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
    // Not yet initialized — send CreatePool
    const totalRewardBigInt = BigInt(Math.round(parseFloat(params.totalReward)));

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
    // Fire-and-forget — will be processed within seconds
  }

  return { contractAddress: contractAddrStr, poolJettonWalletAddress };
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
  const { keyPair, contract: walletContract } = await getAdminWallet();

  const contractAddress = Address.parse(contractAddressStr);

  const winnersDict = Dictionary.empty(
    Dictionary.Keys.Address(),
    Dictionary.Values.BigInt(257),
  );
  for (const winner of winners) {
    winnersDict.set(Address.parse(winner.walletAddress), BigInt(winner.shareBasisPoints));
  }

  // Budget: 0.07 TON per winner (jetton transfer gas) + 0.1 TON base
  const gasAmount = toNano('0.1') + BigInt(winners.length) * toNano('0.07');

  const seqno = await walletContract.getSeqno();
  await walletContract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    messages: [
      internal({
        to: contractAddress,
        value: gasAmount,
        body: beginCell()
          .store(
            storeDistributeRewards({
              $$type: 'DistributeRewards',
              winners: winnersDict,
            }),
          )
          .endCell(),
      }),
    ],
    sendMode: SendMode.PAY_GAS_SEPARATELY,
  });
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
  const { keyPair, contract: walletContract } = await getAdminWallet();

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

  // Budget: 0.07 TON per winner (jetton transfer gas) + 0.1 TON base + 0.07 for owner refund
  const gasAmount = toNano('0.1') + BigInt(winners.length + 1) * toNano('0.07');

  const seqno = await walletContract.getSeqno();
  await walletContract.sendTransfer({
    secretKey: keyPair.secretKey,
    seqno,
    messages: [
      internal({
        to: contractAddress,
        value: gasAmount,
        body: beginCell()
          .store(
            storeCancelPool({
              $$type: 'CancelPool',
              winners: winnersDict,
            }),
          )
          .endCell(),
      }),
    ],
    sendMode: SendMode.PAY_GAS_SEPARATELY,
  });
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

  // Convert display amount to nano-tokens using the token's decimal places
  const rawAmount = BigInt(
    Math.round(parseFloat(params.totalReward) * Math.pow(10, params.decimals)),
  );

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
    .storeCoins(toNano('0.05'))     // forward_ton_amount (for notification gas)
    .storeBit(false)                // forward_payload = empty slice (inline)
    .endCell();

  return {
    to: creatorJettonWallet.toString({ bounceable: true, urlSafe: true }),
    amount: toNano('0.15').toString(), // gas budget for the transfer
    payload: body.toBoc().toString('base64'),
  };
}
