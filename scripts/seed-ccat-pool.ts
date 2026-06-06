/**
 * scripts/seed-ccat-pool.ts
 *
 * One-shot script: seeds the CCAT "Communist Cat" pool into the database
 * AND deploys its escrow contract on-chain, then marks it ENDED and ready
 * for distribution via the admin panel.
 *
 * Pool parameters
 * ───────────────
 *   Jetton master:  EQBpfD5q4aFgHU17KvNPN_P0QOy41MOIj2TwGX0bbAz44DNs
 *   Token:          CCAT (Communist Cat, 9 decimals)
 *   Total reward:   1 000 CCAT  (display units stored in DB)
 *   Duration:       7 days (ended immediately via admin endPool call)
 *   Reward slots:   5
 *
 * Winners (basis points must sum to 10 000)
 * ──────────────────────────────────────────
 *   30%  UQBT3gemp3WFCdrzZySK4qYxyqlxFAnnkw6f2zAQuW7wycpY  → 300 CCAT
 *   25%  UQAVodkqGkP7tFeMkNvObvdAqpu4T4RGZAVZJ8gK_fm6i8qY  → 250 CCAT
 *   20%  UQD4MGOmgi8JgC1-lmCwy7z-5ofDTG8yx8QeeDPHdd8H3PFo  → 200 CCAT
 *   15%  UQA1LHKfnq3kyGADs1gZsFSvXyzNyWxaPcGPyEser39Lod9P  → 150 CCAT
 *   10%  UQBRYI_UJhv-HIf9mpKB5lWFt8s-Fif-jAuTCL3Cyv-lIGWr  → 100 CCAT
 *
 * Run:
 *   npx ts-node --project scripts/tsconfig.json scripts/seed-ccat-pool.ts
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
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const pbkdf2Async = promisify(pbkdf2);

// ── Pool configuration ─────────────────────────────────────────────────────────

const JETTON_MASTER     = 'EQBpfD5q4aFgHU17KvNPN_P0QOy41MOIj2TwGX0bbAz44DNs';
const TOKEN_SYMBOL      = 'CCAT';
const TOKEN_NAME        = 'Communist Cat';
const LOGO_URL          = 'https://d121vty759npai.cloudfront.net/images/a309f7fa4624486d981fa385ce18e1a2.jpeg';
const TOTAL_REWARD_DISPLAY = '1000';          // stored in DB (display units)
const TOTAL_REWARD_NANO    = 1_000_000_000_000n; // 1 000 CCAT × 10^9 (for contract)
const DURATION_DAYS     = 7;
const REWARD_SLOTS      = 5;
// Nonce captured once so DB and contract use the same value
const NONCE = BigInt(Date.now());

// Winner wallets and their exact basis-point allocations (must sum to 10 000)
const PARTICIPANTS = [
  { wallet: 'UQBT3gemp3WFCdrzZySK4qYxyqlxFAnnkw6f2zAQuW7wycpY', points: 30000, bps: 3000, ccat: 300  },
  { wallet: 'UQAVodkqGkP7tFeMkNvObvdAqpu4T4RGZAVZJ8gK_fm6i8qY', points: 25000, bps: 2500, ccat: 250  },
  { wallet: 'UQD4MGOmgi8JgC1-lmCwy7z-5ofDTG8yx8QeeDPHdd8H3PFo', points: 20000, bps: 2000, ccat: 200  },
  { wallet: 'UQA1LHKfnq3kyGADs1gZsFSvXyzNyWxaPcGPyEser39Lod9P', points: 15000, bps: 1500, ccat: 150  },
  { wallet: 'UQBRYI_UJhv-HIf9mpKB5lWFt8s-Fif-jAuTCL3Cyv-lIGWr', points: 10000, bps: 1000, ccat: 100  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

async function retry<T>(fn: () => Promise<T>, label: string, maxAttempts = 5): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); } catch (err: unknown) {
      const is429 = String(err).includes('429');
      if (attempt === maxAttempts) throw err;
      const delay = is429 ? 3000 * attempt : 2000;
      console.log(`  [${label}] attempt ${attempt} failed${is429 ? ' (429)' : ''} - retrying in ${delay / 1000}s…`);
      await sleep(delay);
    }
  }
  throw new Error('retry exhausted');
}

async function getAdminWallet(): Promise<{
  keyPair: KeyPair;
  contract: OpenedContract<WalletContractV5R1>;
  client: TonClient;
  address: string;
}> {
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) throw new Error('ADMIN_MNEMONIC not set in .env');
  const seed   = await pbkdf2Async(mnemonic.trim().normalize('NFKD'), 'mnemonic'.normalize('NFKD'), 2048, 64, 'sha512');
  const master = await getED25519MasterKeyFromSeed(seed);
  const lvl1   = await deriveED25519HardenedKey(master, 44);
  const lvl2   = await deriveED25519HardenedKey(lvl1,   607);
  const lvl3   = await deriveED25519HardenedKey(lvl2,   0);
  const keyPair = await keyPairFromSeed(lvl3.key);
  const client  = new TonClient({ endpoint: process.env.TON_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC' });
  const wallet  = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
  return { keyPair, contract: client.open(wallet), client, address: wallet.address.toString({ bounceable: false, urlSafe: true }) };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  Gramketing - CCAT Pool Seed + Contract Deploy');
  console.log('════════════════════════════════════════════════════════\n');

  // Validate bps sum
  const totalBps = PARTICIPANTS.reduce((s, p) => s + p.bps, 0);
  if (totalBps !== 10000) throw new Error(`Basis points sum to ${totalBps}, must be 10000`);

  const { keyPair, contract: walletContract, client, address: adminAddr } = await getAdminWallet();
  const adminWalletAddress = process.env.ADMIN_WALLET_ADDRESS ?? adminAddr;

  console.log(`  Admin wallet:  ${adminAddr}`);
  const balance = await retry(() => client.getBalance(walletContract.address), 'getBalance');
  console.log(`  TON balance:   ${Number(balance) / 1e9} TON`);
  if (balance < toNano('0.5')) throw new Error(`Need at least 0.5 TON for deployment. Have: ${Number(balance) / 1e9}`);

  // ── Compute contract address ─────────────────────────────────────────────────
  const owner    = walletContract.address;
  const poolInit = await GramketingPool.init(owner, owner, NONCE);
  const poolAddr = contractAddress(0, poolInit);
  const poolAddrBounceable    = poolAddr.toString({ bounceable: true,  urlSafe: true });
  const poolAddrNonBounceable = poolAddr.toString({ bounceable: false, urlSafe: true });

  console.log(`\n  Nonce:                     ${NONCE}`);
  console.log(`  Contract (bounceable):     ${poolAddrBounceable}`);
  console.log(`  Contract (non-bounceable): ${poolAddrNonBounceable}`);

  // Derive CCAT jetton wallet for this contract
  await sleep(1000);
  const poolJettonWallet    = await retry(() => getJettonWalletAddress(JETTON_MASTER, poolAddrBounceable), 'getJettonWallet');
  const poolJettonWalletStr = poolJettonWallet.toString({ bounceable: true, urlSafe: true });
  console.log(`  CCAT jetton wallet:        ${poolJettonWalletStr}\n`);

  // ── Step 1: Seed database ────────────────────────────────────────────────────
  console.log('Step 1: Seeding database…');

  // Clean up any pre-existing CCAT project (idempotent re-run safety)
  const existing = await prisma.project.findFirst({
    where: { jettonMasterAddress: JETTON_MASTER, name: TOKEN_NAME },
    include: { pools: { include: { participants: true, poolPosts: true, adminLogs: true, platformRevenue: true } } },
  });
  if (existing) {
    console.log(`  Found existing "${TOKEN_NAME}" project - removing…`);
    for (const pool of existing.pools) {
      await prisma.adminLog.deleteMany({ where: { poolId: pool.id } });
      await prisma.poolPost.deleteMany({ where: { poolId: pool.id } });
      await prisma.poolParticipant.deleteMany({ where: { poolId: pool.id } });
      await prisma.platformRevenue.deleteMany({ where: { poolId: pool.id } });
      await prisma.pool.delete({ where: { id: pool.id } });
    }
    await prisma.project.delete({ where: { id: existing.id } });
    console.log('  ✓ Cleaned up.\n');
  }

  // Upsert pool owner (admin wallet as creator)
  await prisma.user.upsert({
    where: { walletAddress: adminWalletAddress },
    update: {},
    create: { walletAddress: adminWalletAddress },
  });

  // Project
  const project = await prisma.project.create({
    data: {
      ownerWalletAddress: adminWalletAddress,
      name:               TOKEN_NAME,
      tokenSymbol:        TOKEN_SYMBOL,
      jettonMasterAddress: JETTON_MASTER,
      logoUrl:            LOGO_URL,
      description:        'Communist Cat community pool on TON.',
    },
  });
  console.log(`  ✓ Project: ${project.id}`);

  // Pool - set to ENDED (7 days ago → 1 min ago)
  const now       = new Date();
  const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const endDate   = new Date(now.getTime() - 60 * 1000);

  const pool = await prisma.pool.create({
    data: {
      projectId:           project.id,
      totalReward:         TOTAL_REWARD_DISPLAY, // display units - UI shows "1,000 CCAT"
      tokenSymbol:         TOKEN_SYMBOL,
      jettonMasterAddress: JETTON_MASTER,
      durationDays:        DURATION_DAYS,
      rewardSlots:         REWARD_SLOTS,
      accessFeePaidIn:     'TON',
      campaignType:        'both',
      startDate,
      endDate,
      status:              'ENDED',
      contractAddress:     poolAddrBounceable,  // set immediately - we know the address
    },
  });
  console.log(`  ✓ Pool:    ${pool.id}  (status=ENDED)`);

  // Participants
  for (const p of PARTICIPANTS) {
    const user = await prisma.user.upsert({
      where:  { walletAddress: p.wallet },
      update: {},
      create: { walletAddress: p.wallet },
    });
    await prisma.poolParticipant.upsert({
      where:  { poolId_userId: { poolId: pool.id, userId: user.id } },
      update: { totalPoints: p.points },
      create: {
        poolId:      pool.id,
        userId:      user.id,
        totalPoints: p.points,
        xPoints:     p.points,
        telegramPoints: 0,
      },
    });
    console.log(`  ✓ Participant: ${p.wallet.slice(0, 14)}…  ${p.points.toLocaleString()} pts (${p.bps / 100}%)`);
  }
  console.log('');

  // ── Step 2: Deploy contract ──────────────────────────────────────────────────
  console.log('Step 2: Deploying escrow contract…');
  await sleep(1000);
  const existingState = await retry(() => client.getContractState(poolAddr), 'getContractState');
  console.log(`  Current state: ${existingState.state}`);

  if (existingState.state !== 'active') {
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
      const st = await retry(() => client.getContractState(poolAddr), 'pollState').catch(() => ({ state: 'unknown' }));
      process.stdout.write(`  [${i + 1}/30] state=${st.state}\r`);
      if (st.state === 'active') { active = true; break; }
    }
    if (!active) throw new Error('Deployment timed out - check admin wallet TON balance');
    console.log('\n  ✓ Contract active.');
  } else {
    console.log('  Already active - skipping deploy.');
  }

  // ── Step 3: CreatePool ───────────────────────────────────────────────────────
  console.log('\nStep 3: Sending CreatePool…');
  await sleep(2000);
  const openPool = client.open(GramketingPool.fromAddress(poolAddr));
  const info = await retry(() => openPool.getPoolInfo(), 'getPoolInfo');
  console.log(`  startTime: ${info.startTime}  status: ${info.status}`);

  if (info.startTime === 0n) {
    const seqno = await retry(() => walletContract.getSeqno(), 'getSeqno-createPool');
    await sleep(1000);
    await retry(() => walletContract.sendTransfer({
      secretKey: keyPair.secretKey, seqno,
      messages: [internal({
        to: poolAddr, value: toNano('0.05'),
        body: beginCell().store(storeCreatePool({
          $$type: 'CreatePool',
          jettonWalletAddress: poolJettonWallet,
          totalReward:  TOTAL_REWARD_NANO,
          durationDays: BigInt(DURATION_DAYS),
          rewardSlots:  BigInt(REWARD_SLOTS),
        })).endCell(),
      })],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }), 'sendCreatePool');

    console.log('  Waiting 15s for CreatePool…');
    await sleep(15000);
    const info2 = await retry(() => openPool.getPoolInfo(), 'getPoolInfo2');
    if (info2.startTime === 0n) throw new Error('CreatePool was not processed - check contract logs');
    console.log(`  ✓ Pool initialized. startTime=${info2.startTime}`);
  } else {
    console.log('  Already initialized - skipping CreatePool.');
  }

  // ── Step 4: EndPool ──────────────────────────────────────────────────────────
  console.log('\nStep 4: Ending pool on-chain…');
  await sleep(2000);
  const infoEnd = await retry(() => openPool.getPoolInfo(), 'getPoolInfoEnd');
  console.log(`  On-chain status: ${infoEnd.status} (0=ACTIVE 1=ENDED 2=DISTRIBUTED)`);

  if (infoEnd.status === 0n) {
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

    console.log('  Waiting 15s for endPool…');
    await sleep(15000);
    const info3 = await retry(() => openPool.getPoolInfo(), 'getPoolInfo3');
    if (info3.status !== 1n) throw new Error(`endPool failed - on-chain status=${info3.status}`);
    console.log('  ✓ Contract is ENDED (status=1).');
  } else if (infoEnd.status === 1n) {
    console.log('  Already ENDED - skipping.');
  } else {
    throw new Error(`Unexpected on-chain status ${infoEnd.status} - cannot end pool`);
  }

  // ── Log deployment in DB ─────────────────────────────────────────────────────
  await prisma.adminLog.create({
    data: {
      action:  'DEPLOY_CONTRACT',
      level:   'info',
      poolId:  pool.id,
      message: `CCAT escrow contract deployed and ended via seed script`,
      details: {
        contractAddress: poolAddrBounceable,
        jettonWallet:    poolJettonWalletStr,
        nonce:           NONCE.toString(),
      },
    },
  });

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  SEED + DEPLOY COMPLETE');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Pool ID:              ${pool.id}`);
  console.log(`  Project ID:           ${project.id}`);
  console.log(`  Contract:             ${poolAddrBounceable}`);
  console.log(`  CCAT jetton wallet:   ${poolJettonWalletStr}`);
  console.log(`  TON Viewer:           https://tonviewer.com/${poolAddrBounceable}`);
  console.log(`  On-chain status:      ENDED (ready for deposit + distribution)`);
  console.log('');
  console.log('  EXPECTED DISTRIBUTION (after deposit)');
  console.log('  ────────────────────────────────────────────────────');
  for (const p of PARTICIPANTS) {
    console.log(`  ${String(p.bps / 100).padStart(3)}%  ${p.wallet}`);
    console.log(`         ${p.ccat} CCAT  (${p.bps} bps)`);
  }

  console.log(`
════════════════════════════════════════════════════════
  NEXT STEP: DEPOSIT 1 000 CCAT INTO THE ESCROW
════════════════════════════════════════════════════════

  Send exactly 1 000 CCAT from TonKeeper/TonSpace to:

    Token:       CCAT (Communist Cat)
    To address:  ${poolAddrBounceable}
    Amount:      1 000 CCAT
    Gas:         attach 0.35 TON (TonKeeper adds automatically)

  ⚠️  Send to the CONTRACT address above - the wallet app
      routes the jetton transfer through your CCAT jetton
      wallet automatically. Do NOT send native TON.

  Verify deposit on TON Viewer:
    https://tonviewer.com/${poolAddrBounceable}
    → "depositedAmount" should show 1000000000000 (1000 × 10⁹)

  Then trigger distribution from the admin panel:
    → /admin/pools → find pool "${TOKEN_NAME}"
    → Click "Distribute Rewards"

  CCAT jetton wallet (for manual verification):
    ${poolJettonWalletStr}
════════════════════════════════════════════════════════
`);
}

main()
  .catch((err) => { console.error('\n❌ Error:', err instanceof Error ? err.message : err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
