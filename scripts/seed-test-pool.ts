/**
 * scripts/seed-test-pool.ts
 *
 * Seeds a test pool into the database for a mainnet distribution test.
 * Idempotent: deletes any existing "Test Pool (Distribution Test)" project first.
 *
 * CRITICAL NOTES BEFORE RUNNING:
 * ──────────────────────────────
 * 1. CONTRACT DISTRIBUTES JETTONS, NOT NATIVE TON.
 *    The GramketingPool contract sends JettonTransfer (TEP-74) messages.
 *    You must deposit a TON-backed JETTON into the escrow — not native TON.
 *    Suggested mainnet jetton for testing:
 *      tsTON (Tonstakers): EQD0vdSA_NedR9uvbgN9EikRX-suesDxGeFg69XQMavfLqIx
 *    Update JETTON_MASTER_ADDRESS below to the jetton you actually hold.
 *
 * 2. ADMIN_MNEMONIC must be set in .env before you can deploy a contract or
 *    trigger distribution from the admin panel.
 *
 * 3. ADMIN_WALLET_ADDRESS must be set in .env — the admin panel checks isAdmin()
 *    on every distribution request and returns 401 if this is missing.
 *
 * Run with:
 *   npx ts-node -e "require('dotenv').config(); require('./scripts/seed-test-pool.ts')"
 * Or add to package.json scripts and run:
 *   npm run seed:test-pool
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Configuration ─────────────────────────────────────────────────────────────

const PROJECT_NAME = 'Test Pool (Distribution Test)';
const TOKEN_SYMBOL = 'TON';

// The jetton master address for the reward token.
// ⚠️  The contract distributes JETTONS, not native TON.
// For a 2-TON equivalent test, use a TON-backed jetton you hold on mainnet.
// tsTON (Tonstakers Liquid Staking) on mainnet:
const JETTON_MASTER_ADDRESS = 'EQD0vdSA_NedR9uvbgN9EikRX-suesDxGeFg69XQMavfLqIx';

// Total reward: 2 TON expressed in nano-tokens (9 decimals for tsTON/jTON)
const TOTAL_REWARD_NANO = '2000000000'; // 2.000000000 tsTON

// Pool owner: must be a real wallet that deployed the escrow contract.
// Using the treasury wallet as the pool owner for this test since it's already configured.
const POOL_OWNER_WALLET =
  process.env.TREASURY_WALLET_ADDRESS ?? 'UQBP2DKXobBEJsrKlG4-zyoKrlhKeJzYaX3JC-9ERtktohBx';

// Participants: wallet addresses and point totals
const PARTICIPANTS = [
  { wallet: 'UQBT3gemp3WFCdrzZySK4qYxyqlxFAnnkw6f2zAQuW7wycpY', points: 30000, pct: 30 },
  { wallet: 'UQAVodkqGkP7tFeMkNvObvdAqpu4T4RGZAVZJ8gK_fm6i8qY', points: 25000, pct: 25 },
  { wallet: 'UQD4MGOmgi8JgC1-lmCwy7z-5ofDTG8yx8QeeDPHdd8H3PFo', points: 20000, pct: 20 },
  { wallet: 'UQA1LHKfnq3kyGADs1gZsFSvXyzNyWxaPcGPyEser39Lod9P', points: 15000, pct: 15 },
  { wallet: 'UQBRYI_UJhv-HIf9mpKB5lWFt8s-Fif-jAuTCL3Cyv-lIGWr', points: 10000, pct: 10 },
] as const;

// Total 2 TON in nanoTON for expected amounts
const TOTAL_NANO = 2_000_000_000n;

// ── Helpers ───────────────────────────────────────────────────────────────────

function nanoToTon(nano: bigint): string {
  const whole = nano / 1_000_000_000n;
  const frac = nano % 1_000_000_000n;
  return `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '') || '0'}`;
}

function expectedNano(pct: number): bigint {
  return (TOTAL_NANO * BigInt(pct)) / 100n;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('  Gramketing — Distribution Test Pool Seeder');
  console.log('════════════════════════════════════════════════════════\n');

  // ── Step 1: Clean up any existing test project ──────────────────────────────
  console.log('Step 1: Cleaning up existing test data…');
  const existing = await prisma.project.findFirst({
    where: { name: PROJECT_NAME },
    include: { pools: { include: { participants: true, poolPosts: true, adminLogs: true } } },
  });

  if (existing) {
    console.log(`  Found existing project "${PROJECT_NAME}" — deleting…`);
    for (const pool of existing.pools) {
      // Delete in dependency order
      await prisma.adminLog.deleteMany({ where: { poolId: pool.id } });
      await prisma.poolPost.deleteMany({ where: { poolId: pool.id } });
      await prisma.poolParticipant.deleteMany({ where: { poolId: pool.id } });
      await prisma.platformRevenue.deleteMany({ where: { poolId: pool.id } });
      await prisma.pool.delete({ where: { id: pool.id } });
    }
    await prisma.project.delete({ where: { id: existing.id } });
    console.log('  ✓ Cleaned up.\n');
  } else {
    console.log('  No existing test data found.\n');
  }

  // ── Step 2: Ensure pool owner user exists ───────────────────────────────────
  console.log('Step 2: Ensuring pool owner user exists…');
  await prisma.user.upsert({
    where: { walletAddress: POOL_OWNER_WALLET },
    update: {},
    create: { walletAddress: POOL_OWNER_WALLET },
  });
  console.log(`  ✓ Owner: ${POOL_OWNER_WALLET}\n`);

  // ── Step 3: Create project ──────────────────────────────────────────────────
  console.log('Step 3: Creating project…');
  const project = await prisma.project.create({
    data: {
      ownerWalletAddress: POOL_OWNER_WALLET,
      name: PROJECT_NAME,
      tokenSymbol: TOKEN_SYMBOL,
      jettonMasterAddress: JETTON_MASTER_ADDRESS,
      description: 'Mainnet distribution test pool. Do not modify.',
    },
  });
  console.log(`  ✓ Project ID: ${project.id}\n`);

  // ── Step 4: Create pool ─────────────────────────────────────────────────────
  console.log('Step 4: Creating pool (status=ENDED)…');
  const now = new Date();
  const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  const endDate = new Date(now.getTime() - 60 * 1000);                  // 1 minute ago

  const pool = await prisma.pool.create({
    data: {
      projectId: project.id,
      totalReward: TOTAL_REWARD_NANO,
      tokenSymbol: TOKEN_SYMBOL,
      jettonMasterAddress: JETTON_MASTER_ADDRESS,
      durationDays: 7,
      rewardSlots: 5,
      accessFeePaidIn: 'TON',
      campaignType: 'both',
      startDate,
      endDate,
      status: 'ENDED',
      // contractAddress: null — must be filled in after you deploy the escrow contract
      // See Step 5 in the checklist below.
    },
  });
  console.log(`  ✓ Pool ID: ${pool.id}`);
  console.log(`  ✓ Status: ENDED`);
  console.log(`  ✓ Jetton master: ${JETTON_MASTER_ADDRESS}`);
  console.log(`  ✓ Total reward (nano): ${TOTAL_REWARD_NANO}\n`);

  // ── Step 5: Create participants ─────────────────────────────────────────────
  console.log('Step 5: Creating 5 participants…');
  for (const p of PARTICIPANTS) {
    const user = await prisma.user.upsert({
      where: { walletAddress: p.wallet },
      update: {},
      create: { walletAddress: p.wallet },
    });

    await prisma.poolParticipant.upsert({
      where: { poolId_userId: { poolId: pool.id, userId: user.id } },
      update: { totalPoints: p.points },
      create: {
        poolId: pool.id,
        userId: user.id,
        totalPoints: p.points,
        xPoints: p.points,
        telegramPoints: 0,
      },
    });

    const nano = expectedNano(p.pct);
    console.log(`  ✓ ${p.wallet.slice(0, 12)}… | ${p.points.toLocaleString()} pts (${p.pct}%) → ${nanoToTon(nano)} tsTON`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log('  SEED COMPLETE — Pool is in the database');
  console.log('════════════════════════════════════════════════════════');
  console.log(`\n  Pool ID:       ${pool.id}`);
  console.log(`  Project ID:    ${project.id}`);
  console.log(`  Status:        ENDED`);
  console.log(`  Reward token:  ${TOKEN_SYMBOL} (jetton)`);
  console.log(`  Jetton master: ${JETTON_MASTER_ADDRESS}`);
  console.log(`  Total reward:  2.000000000 tsTON (${TOTAL_REWARD_NANO} nano)`);

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  EXPECTED DISTRIBUTION');
  console.log('════════════════════════════════════════════════════════');
  for (const p of PARTICIPANTS) {
    const nano = expectedNano(p.pct);
    const bps = Math.round(p.pct * 100);
    console.log(`  ${p.pct}%  ${p.wallet}`);
    console.log(`       ${nanoToTon(nano)} tsTON  (${bps} basis points)`);
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('  REQUIRED STEPS BEFORE TRIGGERING DISTRIBUTION');
  console.log('════════════════════════════════════════════════════════');
  console.log(`
  ⚠️  THE CONTRACT DISTRIBUTES JETTONS — NOT NATIVE TON
     You must deposit a TON-backed jetton into the escrow contract,
     not send native TON to its address. Native TON sent to the
     contract will not be distributed.

  1. SET ENV VARS (in .env AND Vercel project settings):
     ┌─────────────────────────────────────────────────────────────┐
     │ ADMIN_MNEMONIC="word1 word2 ... word24"                     │
     │ ADMIN_WALLET_ADDRESS=<derived address from mnemonic>        │
     └─────────────────────────────────────────────────────────────┘

  2. DEPLOY THE ESCROW CONTRACT via the admin panel:
     → Go to /admin/pools → find pool ${pool.id.slice(0, 8)}…
     → Click "Deploy Contract"
     → Wait for confirmation (the contractAddress is saved to the pool)

  3. DEPOSIT 2 tsTON INTO THE ESCROW CONTRACT:
     Once you have the contract address, send 2 tsTON from TonKeeper:
     ┌─────────────────────────────────────────────────────────────┐
     │ In TonKeeper:                                               │
     │   Token: tsTON (Tonstakers Liquid Staking)                  │
     │   To: <contractAddress from step 2>                         │
     │   Amount: 2.0 tsTON                                         │
     │   Note: Add a small comment or leave blank                  │
     └─────────────────────────────────────────────────────────────┘
     ⚠️  The RECEIVING address for the jetton transfer must be the
         CONTRACT address, not the jetton wallet address. TonKeeper
         handles the routing automatically when you send a jetton.

  4. VERIFY DEPOSIT on TON Viewer:
     https://tonviewer.com/<contractAddress>
     The "depositedAmount" in the contract state should show 2000000000

  5. TRIGGER DISTRIBUTION from admin panel:
     → /admin/pools → find the pool → click "Distribute Rewards"
     → The admin wallet signs and sends the DistributeRewards message
     → On-chain: contract sends JettonTransfer to each winner

  6. VERIFY PAYOUTS on TON Viewer:
     Check each wallet received the correct tsTON amount:
     ${PARTICIPANTS.map((p) => {
       const nano = expectedNano(p.pct);
       return `     → ${p.wallet}\n       ${nanoToTon(nano)} tsTON: https://tonviewer.com/${p.wallet}`;
     }).join('\n')}
`);

  console.log('════════════════════════════════════════════════════════\n');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
