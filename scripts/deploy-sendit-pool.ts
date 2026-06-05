/**
 * scripts/deploy-sendit-pool.ts
 *
 * Deploys a fresh GramketingPool escrow contract configured for the SENDIT jetton.
 *
 * Pool parameters:
 *   Jetton master:  EQA6EC52PHvxJnuJoMturYEWJG9621YxMGrncV22ekLj8Zue  (SENDIT mainnet)
 *   Total reward:   1000 SEND  (1_000_000_000_000 nano — assumes 9 decimals)
 *   Duration:       7 days
 *   Reward slots:   5
 *
 * Winners (for reference — passed to DistributeRewards separately, not during deploy):
 *   30%  UQBT3gemp3WFCdrzZySK4qYxyqlxFAnnkw6f2zAQuW7wycpY  →  300 SEND  (3000 bps)
 *   25%  UQAVodkqGkP7tFeMkNvObvdAqpu4T4RGZAVZJ8gK_fm6i8qY  →  250 SEND  (2500 bps)
 *   20%  UQD4MGOmgi8JgC1-lmCwy7z-5ofDTG8yx8QeeDPHdd8H3PFo  →  200 SEND  (2000 bps)
 *   15%  UQA1LHKfnq3kyGADs1gZsFSvXyzNyWxaPcGPyEser39Lod9P  →  150 SEND  (1500 bps)
 *   10%  UQBRYI_UJhv-HIf9mpKB5lWFt8s-Fif-jAuTCL3Cyv-lIGWr  →  100 SEND  (1000 bps)
 *   Total basis points: 10000 (100%) ✓
 *
 * ⚠️  DECIMAL ASSUMPTION: SENDIT total supply is 10^18 nano → 9 decimals assumed.
 *     Verify before depositing: 1000 SEND = 1_000_000_000_000 nano.
 *
 * Run:
 *   npx ts-node --project scripts/tsconfig.json scripts/deploy-sendit-pool.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Address, beginCell, toNano, internal, SendMode, contractAddress } from '@ton/core';
import type { OpenedContract } from '@ton/core';
import { pbkdf2 } from 'crypto';
import { promisify } from 'util';
import {
  keyPairFromSeed,
  getED25519MasterKeyFromSeed,
  deriveED25519HardenedKey,
  KeyPair,
} from '@ton/crypto';
import { WalletContractV5R1, TonClient } from '@ton/ton';
import {
  GramketingPool,
  storeCreatePool,
} from '../contracts/output/gramketing_pool_GramketingPool';
import { getJettonWalletAddress } from '../lib/gramketing-pool-contract';

const pbkdf2Async = promisify(pbkdf2);

// ── Pool configuration ────────────────────────────────────────────────────────

const JETTON_MASTER     = 'EQA6EC52PHvxJnuJoMturYEWJG9621YxMGrncV22ekLj8Zue'; // SENDIT mainnet
const TOTAL_REWARD_NANO = 1_000_000_000_000n; // 1000 SEND at 9 decimals
const DURATION_DAYS     = 7;
const REWARD_SLOTS      = 5;

// Winners — for reference only. Passed to DistributeRewards separately.
export const WINNERS = [
  { wallet: 'UQBT3gemp3WFCdrzZySK4qYxyqlxFAnnkw6f2zAQuW7wycpY', bps: 3000, pct: 30,  send: 300  },
  { wallet: 'UQAVodkqGkP7tFeMkNvObvdAqpu4T4RGZAVZJ8gK_fm6i8qY', bps: 2500, pct: 25,  send: 250  },
  { wallet: 'UQD4MGOmgi8JgC1-lmCwy7z-5ofDTG8yx8QeeDPHdd8H3PFo', bps: 2000, pct: 20,  send: 200  },
  { wallet: 'UQA1LHKfnq3kyGADs1gZsFSvXyzNyWxaPcGPyEser39Lod9P', bps: 1500, pct: 15,  send: 150  },
  { wallet: 'UQBRYI_UJhv-HIf9mpKB5lWFt8s-Fif-jAuTCL3Cyv-lIGWr', bps: 1000, pct: 10,  send: 100  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

async function retry<T>(fn: () => Promise<T>, label: string, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const is429 = String(err).includes('429');
      if (attempt === maxAttempts) throw err;
      const delay = is429 ? 3000 * attempt : 2000;
      console.log(`  [${label}] attempt ${attempt} failed${is429 ? ' (429)' : ''} — retrying in ${delay / 1000}s…`);
      await sleep(delay);
    }
  }
  throw new Error('retry exhausted');
}

async function getAdminKeypairAndWallet(): Promise<{
  keyPair: KeyPair;
  wallet: WalletContractV5R1;
  contract: OpenedContract<WalletContractV5R1>;
  client: TonClient;
  address: string;
}> {
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) throw new Error('ADMIN_MNEMONIC not set in .env');
  const seed = await pbkdf2Async(
    mnemonic.trim().normalize('NFKD'), 'mnemonic'.normalize('NFKD'),
    2048, 64, 'sha512',
  );
  const master  = await getED25519MasterKeyFromSeed(seed);
  const lvl1    = await deriveED25519HardenedKey(master, 44);
  const lvl2    = await deriveED25519HardenedKey(lvl1,   607);
  const lvl3    = await deriveED25519HardenedKey(lvl2,   0);
  const keyPair = await keyPairFromSeed(lvl3.key);
  const client  = new TonClient({ endpoint: process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC' });
  const wallet  = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
  const contract = client.open(wallet);
  const address  = wallet.address.toString({ bounceable: false, urlSafe: true });
  return { keyPair, wallet, contract, client, address };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  Deploy GramketingPool — SENDIT pool');
  console.log('════════════════════════════════════════════════════════\n');

  // ── Step 1: Load admin wallet ────────────────────────────────────────────
  console.log('Step 1: Loading admin wallet…');
  const { keyPair, contract: walletContract, client, address: adminAddr } = await getAdminKeypairAndWallet();
  console.log(`  Admin wallet:  ${adminAddr}`);

  const balance = await retry(() => client.getBalance(walletContract.address), 'getBalance');
  console.log(`  TON balance:   ${Number(balance) / 1e9} TON`);
  if (balance < toNano('0.5')) {
    throw new Error(`Need at least 0.5 TON for deploy + CreatePool + endPool. Have: ${Number(balance) / 1e9}`);
  }

  // ── Step 2: Compute deterministic contract address ───────────────────────
  console.log('\nStep 2: Computing contract address…');
  const owner = walletContract.address;
  const admin = walletContract.address;

  const poolInit = await GramketingPool.init(owner, admin, BigInt(Date.now()));
  const poolAddr = contractAddress(0, poolInit);
  const poolAddrBounceable    = poolAddr.toString({ bounceable: true,  urlSafe: true });
  const poolAddrNonBounceable = poolAddr.toString({ bounceable: false, urlSafe: true });
  console.log(`  Contract (bounceable):     ${poolAddrBounceable}`);
  console.log(`  Contract (non-bounceable): ${poolAddrNonBounceable}`);

  // ── Step 3: Check contract state ────────────────────────────────────────
  console.log('\nStep 3: Checking contract state…');
  await sleep(1500);
  const existingState = await retry(() => client.getContractState(poolAddr), 'getContractState');
  console.log(`  State: ${existingState.state}`);

  if (existingState.state !== 'active') {
    console.log('  Deploying…');
    await sleep(1500);
    const seqno = await retry(() => walletContract.getSeqno(), 'getSeqno-deploy');
    await sleep(1000);
    await retry(() => walletContract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: poolAddr,
          value: toNano('0.15'),
          init: poolInit,
          body: beginCell()
            .storeUint(2490013878, 32) // Deploy opcode (Tact Deployable)
            .storeUint(0n, 64)
            .endCell(),
          bounce: false,
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }), 'sendDeploy');

    console.log('  Waiting for contract to become active (up to 90s)…');
    let active = false;
    for (let i = 0; i < 30; i++) {
      await sleep(3000);
      const state = await retry(
        () => client.getContractState(poolAddr),
        'pollState',
      ).catch(() => ({ state: 'unknown' }));
      process.stdout.write(`  [${i + 1}/30] state=${state.state}\r`);
      if (state.state === 'active') { active = true; break; }
    }
    if (!active) throw new Error('Deployment timed out — check admin wallet on TON Viewer');
    console.log('\n  ✓ Contract is active.');
  } else {
    console.log('  Contract already active — skipping deploy.');
  }

  // ── Step 4: Derive SENDIT jetton wallet for this contract ────────────────
  console.log('\nStep 4: Deriving SENDIT jetton wallet address for contract…');
  console.log(`  Jetton master: ${JETTON_MASTER}`);
  await sleep(2000);
  const poolJettonWallet = await retry(
    () => getJettonWalletAddress(JETTON_MASTER, poolAddrBounceable),
    'getJettonWalletAddress',
  );
  const poolJettonWalletStr = poolJettonWallet.toString({ bounceable: true, urlSafe: true });
  console.log(`  Contract SENDIT jetton wallet: ${poolJettonWalletStr}`);

  // ── Step 5: Send CreatePool ──────────────────────────────────────────────
  console.log('\nStep 5: Checking if CreatePool needed…');
  await sleep(2000);
  const openPool = client.open(GramketingPool.fromAddress(poolAddr));
  const info = await retry(() => openPool.getPoolInfo(), 'getPoolInfo');
  console.log(`  startTime: ${info.startTime}  status: ${info.status}`);

  if (info.startTime === 0n) {
    console.log('  Sending CreatePool…');
    await sleep(3000);
    const seqno = await retry(() => walletContract.getSeqno(), 'getSeqno-createPool');
    await sleep(1000);
    await retry(() => walletContract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: poolAddr,
          value: toNano('0.05'),
          body: beginCell()
            .store(storeCreatePool({
              $$type: 'CreatePool',
              jettonWalletAddress: poolJettonWallet,
              totalReward: TOTAL_REWARD_NANO,
              durationDays: BigInt(DURATION_DAYS),
              rewardSlots: BigInt(REWARD_SLOTS),
            }))
            .endCell(),
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }), 'sendCreatePool');

    console.log('  Waiting 15s for CreatePool to be processed…');
    await sleep(15000);

    const info2 = await retry(() => openPool.getPoolInfo(), 'getPoolInfo2');
    console.log(`  startTime after: ${info2.startTime}  status: ${info2.status}`);
    const storedWallet = info2.jettonWalletAddress.toString({ bounceable: true, urlSafe: true });
    console.log(`  jettonWalletAddress: ${storedWallet}`);
    if (info2.startTime === 0n) throw new Error('CreatePool was not processed — check TON Viewer');
    if (storedWallet !== poolJettonWalletStr) {
      throw new Error(`Jetton wallet mismatch! Stored: ${storedWallet}, Expected: ${poolJettonWalletStr}`);
    }
    console.log('  ✓ Pool initialized with correct SENDIT jetton wallet.');
  } else {
    console.log('  Pool already initialized — skipping CreatePool.');
  }

  // ── Step 6: Send endPool ─────────────────────────────────────────────────
  console.log('\nStep 6: Ending pool so distribution can be triggered immediately…');
  await sleep(2000);
  const infoForEnd = await retry(() => openPool.getPoolInfo(), 'getPoolInfoForEnd');
  console.log(`  Current status: ${infoForEnd.status} (0=ACTIVE 1=ENDED 2=DISTRIBUTED)`);

  if (infoForEnd.status === 0n) {
    await sleep(3000);
    const seqno = await retry(() => walletContract.getSeqno(), 'getSeqno-endPool');
    await sleep(1000);
    await retry(() => walletContract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: poolAddr,
          value: toNano('0.05'),
          body: beginCell()
            .storeUint(0, 32)
            .storeStringTail('endPool')
            .endCell(),
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }), 'sendEndPool');

    console.log('  Waiting 15s for endPool…');
    await sleep(15000);
    const info3 = await retry(() => openPool.getPoolInfo(), 'getPoolInfo3');
    console.log(`  Status after endPool: ${info3.status} (expected 1 = ENDED)`);
    if (info3.status !== 1n) throw new Error(`endPool did not take effect — status=${info3.status}`);
    console.log('  ✓ Pool ended on-chain.');
  } else {
    console.log(`  Status already ${infoForEnd.status} — skipping endPool.`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  DEPLOYMENT COMPLETE');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Contract address:       ${poolAddrBounceable}`);
  console.log(`  SENDIT jetton wallet:   ${poolJettonWalletStr}`);
  console.log(`  Jetton master (SENDIT): ${JETTON_MASTER}`);
  console.log(`  Total reward:           1000 SEND (${TOTAL_REWARD_NANO} nano)`);
  console.log(`  Duration:               ${DURATION_DAYS} days`);
  console.log(`  Reward slots:           ${REWARD_SLOTS}`);
  console.log(`  Admin/owner wallet:     ${adminAddr}`);
  console.log(`\n  TON Viewer: https://tonviewer.com/${poolAddrBounceable}`);
  console.log(`
  ── NEXT STEP: DEPOSIT 1000 SEND ────────────────────────
  Send 1000 SEND to the CONTRACT address from TonKeeper:
    Token:  SENDIT
    To:     ${poolAddrBounceable}
    Amount: 1000 SEND

  TonKeeper routes through your SENDIT jetton wallet to
  the contract's SENDIT jetton wallet (${poolJettonWalletStr}).
  The contract records depositedAmount = ${TOTAL_REWARD_NANO} via
  JettonTransferNotification.

  ── WINNER DISTRIBUTION ─────────────────────────────────
  When depositedAmount = ${TOTAL_REWARD_NANO}, trigger DistributeRewards
  with the following winners (basis points):
`);
  for (const w of WINNERS) {
    const nano = TOTAL_REWARD_NANO * BigInt(w.bps) / 10000n;
    console.log(`    ${w.pct}%  ${w.wallet}`);
    console.log(`         ${w.send} SEND  (${w.bps} bps, ${nano} nano)`);
  }
  console.log('  ────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); });
