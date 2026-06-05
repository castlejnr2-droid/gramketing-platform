/**
 * scripts/deploy-lada-pool.ts
 *
 * Deploys a fresh GramketingPool escrow contract configured for the LADA jetton.
 *
 * Pool parameters:
 *   Jetton master:  EQBjNisz_m-sdA9TcosQMmugdhl6hDjGcCMgQFa85p_8jx7p  (LADA mainnet)
 *   Total reward:   100 LADA  (100_000_000_000 nano — 9 decimals)
 *   Duration:       7 days
 *   Reward slots:   5
 *   Nonce:          1780699848943  (timestamp — ensures unique contract address)
 *
 * Winners (for reference — passed to DistributeRewards separately):
 *   30%  UQBT3gemp3WFCdrzZySK4qYxyqlxFAnnkw6f2zAQuW7wycpY  →  30 LADA  (3000 bps)
 *   25%  UQAVodkqGkP7tFeMkNvObvdAqpu4T4RGZAVZJ8gK_fm6i8qY  →  25 LADA  (2500 bps)
 *   20%  UQD4MGOmgi8JgC1-lmCwy7z-5ofDTG8yx8QeeDPHdd8H3PFo  →  20 LADA  (2000 bps)
 *   15%  UQA1LHKfnq3kyGADs1gZsFSvXyzNyWxaPcGPyEser39Lod9P  →  15 LADA  (1500 bps)
 *   10%  UQBRYI_UJhv-HIf9mpKB5lWFt8s-Fif-jAuTCL3Cyv-lIGWr  →  10 LADA  (1000 bps)
 *   Total basis points: 10000 (100%) ✓
 *
 * ⚠️  DECIMAL NOTE: LADA has 9 decimals (confirmed on-chain).
 *     100 LADA = 100_000_000_000 nano (100 * 10^9).
 *
 * Run:
 *   npx ts-node --project scripts/tsconfig.json scripts/deploy-lada-pool.ts
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

const JETTON_MASTER     = 'EQBjNisz_m-sdA9TcosQMmugdhl6hDjGcCMgQFa85p_8jx7p'; // LADA mainnet
const TOTAL_REWARD_NANO = 100_000_000_000n; // 100 LADA at 9 decimals
const DURATION_DAYS     = 7;
const REWARD_SLOTS      = 5;
const NONCE             = 1780699848943n; // timestamp salt — guarantees unique contract address

export const WINNERS = [
  { wallet: 'UQBT3gemp3WFCdrzZySK4qYxyqlxFAnnkw6f2zAQuW7wycpY', bps: 3000, pct: 30, lada: 30  },
  { wallet: 'UQAVodkqGkP7tFeMkNvObvdAqpu4T4RGZAVZJ8gK_fm6i8qY', bps: 2500, pct: 25, lada: 25  },
  { wallet: 'UQD4MGOmgi8JgC1-lmCwy7z-5ofDTG8yx8QeeDPHdd8H3PFo', bps: 2000, pct: 20, lada: 20  },
  { wallet: 'UQA1LHKfnq3kyGADs1gZsFSvXyzNyWxaPcGPyEser39Lod9P', bps: 1500, pct: 15, lada: 15  },
  { wallet: 'UQBRYI_UJhv-HIf9mpKB5lWFt8s-Fif-jAuTCL3Cyv-lIGWr', bps: 1000, pct: 10, lada: 10  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

async function retry<T>(fn: () => Promise<T>, label: string, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); } catch (err: unknown) {
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
  keyPair: KeyPair; wallet: WalletContractV5R1;
  contract: OpenedContract<WalletContractV5R1>; client: TonClient; address: string;
}> {
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) throw new Error('ADMIN_MNEMONIC not set in .env');
  const seed = await pbkdf2Async(mnemonic.trim().normalize('NFKD'), 'mnemonic'.normalize('NFKD'), 2048, 64, 'sha512');
  const master  = await getED25519MasterKeyFromSeed(seed);
  const lvl1    = await deriveED25519HardenedKey(master, 44);
  const lvl2    = await deriveED25519HardenedKey(lvl1,   607);
  const lvl3    = await deriveED25519HardenedKey(lvl2,   0);
  const keyPair = await keyPairFromSeed(lvl3.key);
  const client  = new TonClient({ endpoint: process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC' });
  const wallet  = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
  return { keyPair, wallet, contract: client.open(wallet), client, address: wallet.address.toString({ bounceable: false, urlSafe: true }) };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  Deploy GramketingPool — LADA pool');
  console.log('════════════════════════════════════════════════════════\n');

  const { keyPair, contract: walletContract, client, address: adminAddr } = await getAdminKeypairAndWallet();
  console.log(`  Admin wallet:  ${adminAddr}`);

  const balance = await retry(() => client.getBalance(walletContract.address), 'getBalance');
  console.log(`  TON balance:   ${Number(balance) / 1e9} TON`);
  if (balance < toNano('0.5')) throw new Error(`Need at least 0.5 TON. Have: ${Number(balance) / 1e9}`);

  // Compute contract address with nonce
  const owner = walletContract.address;
  const poolInit = await GramketingPool.init(owner, owner, NONCE);
  const poolAddr = contractAddress(0, poolInit);
  const poolAddrBounceable    = poolAddr.toString({ bounceable: true,  urlSafe: true });
  const poolAddrNonBounceable = poolAddr.toString({ bounceable: false, urlSafe: true });

  // Derive LADA jetton wallet for this contract
  await sleep(1500);
  const poolJettonWallet    = await retry(() => getJettonWalletAddress(JETTON_MASTER, poolAddrBounceable), 'getJettonWallet');
  const poolJettonWalletStr = poolJettonWallet.toString({ bounceable: true, urlSafe: true });

  console.log(`\n  Contract (bounceable):     ${poolAddrBounceable}`);
  console.log(`  Contract (non-bounceable): ${poolAddrNonBounceable}`);
  console.log(`  LADA jetton wallet:        ${poolJettonWalletStr}`);
  console.log(`  Nonce:                     ${NONCE}`);
  console.log('');

  // ── Step 1: Deploy ───────────────────────────────────────────────────────
  console.log('Step 1: Checking contract state…');
  await sleep(1500);
  const existingState = await retry(() => client.getContractState(poolAddr), 'getContractState');
  console.log(`  State: ${existingState.state}`);

  if (existingState.state !== 'active') {
    console.log('  Deploying…');
    await sleep(1500);
    const seqno = await retry(() => walletContract.getSeqno(), 'getSeqno-deploy');
    await sleep(1000);
    await retry(() => walletContract.sendTransfer({
      secretKey: keyPair.secretKey, seqno,
      messages: [internal({
        to: poolAddr, value: toNano('0.15'), init: poolInit,
        body: beginCell().storeUint(2490013878, 32).storeUint(0n, 64).endCell(),
        bounce: false,
      })],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }), 'sendDeploy');

    console.log('  Waiting for contract to become active (up to 90s)…');
    let active = false;
    for (let i = 0; i < 30; i++) {
      await sleep(3000);
      const state = await retry(() => client.getContractState(poolAddr), 'pollState').catch(() => ({ state: 'unknown' }));
      process.stdout.write(`  [${i + 1}/30] state=${state.state}\r`);
      if (state.state === 'active') { active = true; break; }
    }
    if (!active) throw new Error('Deployment timed out');
    console.log('\n  ✓ Contract is active.');
  } else {
    console.log('  Already active — skipping deploy.');
  }

  // ── Step 2: CreatePool ───────────────────────────────────────────────────
  console.log('\nStep 2: Checking if CreatePool needed…');
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
      secretKey: keyPair.secretKey, seqno,
      messages: [internal({
        to: poolAddr, value: toNano('0.05'),
        body: beginCell().store(storeCreatePool({
          $$type: 'CreatePool',
          jettonWalletAddress: poolJettonWallet,
          totalReward: TOTAL_REWARD_NANO,
          durationDays: BigInt(DURATION_DAYS),
          rewardSlots:  BigInt(REWARD_SLOTS),
        })).endCell(),
      })],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }), 'sendCreatePool');

    console.log('  Waiting 15s…');
    await sleep(15000);
    const info2 = await retry(() => openPool.getPoolInfo(), 'getPoolInfo2');
    const stored = info2.jettonWalletAddress.toString({ bounceable: true, urlSafe: true });
    console.log(`  startTime: ${info2.startTime}  jettonWallet: ${stored}`);
    if (info2.startTime === 0n) throw new Error('CreatePool not processed');
    if (stored !== poolJettonWalletStr) throw new Error(`Jetton wallet mismatch: ${stored}`);
    console.log('  ✓ Pool initialized with correct LADA jetton wallet.');
  } else {
    console.log('  Already initialized — skipping.');
  }

  // ── Step 3: endPool ──────────────────────────────────────────────────────
  console.log('\nStep 3: Ending pool…');
  await sleep(2000);
  const infoEnd = await retry(() => openPool.getPoolInfo(), 'getPoolInfoEnd');
  console.log(`  Status: ${infoEnd.status} (0=ACTIVE 1=ENDED 2=DISTRIBUTED)`);

  if (infoEnd.status === 0n) {
    await sleep(3000);
    const seqno = await retry(() => walletContract.getSeqno(), 'getSeqno-endPool');
    await sleep(1000);
    await retry(() => walletContract.sendTransfer({
      secretKey: keyPair.secretKey, seqno,
      messages: [internal({
        to: poolAddr, value: toNano('0.05'),
        body: beginCell().storeUint(0, 32).storeStringTail('endPool').endCell(),
      })],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }), 'sendEndPool');

    console.log('  Waiting 15s…');
    await sleep(15000);
    const info3 = await retry(() => openPool.getPoolInfo(), 'getPoolInfo3');
    console.log(`  Status after: ${info3.status} (expected 1)`);
    if (info3.status !== 1n) throw new Error(`endPool failed — status=${info3.status}`);
    console.log('  ✓ Pool ended.');
  } else {
    console.log(`  Already status ${infoEnd.status} — skipping.`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  DEPLOYMENT COMPLETE');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Contract:           ${poolAddrBounceable}`);
  console.log(`  LADA jetton wallet: ${poolJettonWalletStr}`);
  console.log(`  Jetton master:      ${JETTON_MASTER}`);
  console.log(`  Total reward:       100 LADA (${TOTAL_REWARD_NANO} nano)`);
  console.log(`  Nonce:              ${NONCE}`);
  console.log(`\n  TON Viewer: https://tonviewer.com/${poolAddrBounceable}`);
  console.log(`
  ── NEXT STEP: DEPOSIT 100 LADA ─────────────────────────
  Send 100 LADA to the CONTRACT address from TonKeeper:
    Token:  LADA
    To:     ${poolAddrBounceable}
    Amount: 100 LADA (attach 0.35 TON gas)

  ── WINNERS ─────────────────────────────────────────────`);
  for (const w of WINNERS) {
    const nano = TOTAL_REWARD_NANO * BigInt(w.bps) / 10000n;
    console.log(`  ${w.pct}%  ${w.wallet}`);
    console.log(`       ${w.lada} LADA  (${w.bps} bps, ${nano} nano)`);
  }
  console.log('  ────────────────────────────────────────────────────\n');
}

main().catch(e => { console.error('\n❌ Error:', e.message); process.exit(1); });
