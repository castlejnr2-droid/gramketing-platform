/**
 * Manually deploys the escrow contract for a PENDING pool that has no contractAddress.
 *
 * Use this when deployAndInitPool timed out in the Vercel request and the pool
 * is stuck with contractAddress=null.  The Railway scraper also runs this
 * automatically every 30 minutes.
 *
 * Run:
 *   POOL_ID=<id> npx ts-node --transpile-only -P scripts/tsconfig.json scripts/deploy-pool-contract.ts
 *
 * Requires: DATABASE_URL, ADMIN_MNEMONIC, ADMIN_WALLET_ADDRESS, TON_ENDPOINT
 */

import { PrismaClient } from '@prisma/client';
import { deployAndInitPool } from '../lib/gramketing-pool-contract';

const prisma = new PrismaClient();

async function main() {
  const poolId = process.env.POOL_ID;
  if (!poolId) {
    console.error('Set POOL_ID=<id> before running this script.');
    process.exit(1);
  }

  const adminAddress = process.env.ADMIN_WALLET_ADDRESS;
  if (!adminAddress) {
    console.error('ADMIN_WALLET_ADDRESS is not set.');
    process.exit(1);
  }

  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    include: { project: true },
  });

  if (!pool) {
    console.error(`Pool ${poolId} not found.`);
    process.exit(1);
  }

  if (pool.status !== 'PENDING') {
    console.error(`Pool ${poolId} has status ${pool.status} — only PENDING pools can be deployed here.`);
    process.exit(1);
  }

  if (pool.contractAddress) {
    console.log(`Pool ${poolId} already has contractAddress: ${pool.contractAddress}`);
    process.exit(0);
  }

  console.log(`\nDeploying contract for pool ${poolId}:`);
  console.log(`  project:    ${pool.project.name}`);
  console.log(`  owner:      ${pool.project.ownerWalletAddress}`);
  console.log(`  token:      ${pool.tokenSymbol}`);
  console.log(`  reward:     ${pool.totalReward}`);
  console.log(`  duration:   ${pool.durationDays} days`);
  console.log(`  nonce:      ${pool.createdAt.getTime()} (createdAt ms)\n`);

  const { contractAddress, poolJettonWalletAddress } = await deployAndInitPool({
    ownerAddress: pool.project.ownerWalletAddress,
    adminAddress,
    jettonMasterAddress: pool.jettonMasterAddress,
    totalReward: pool.totalReward,
    durationDays: pool.durationDays,
    rewardSlots: pool.rewardSlots,
    nonce: BigInt(pool.createdAt.getTime()),
  });

  await prisma.pool.update({
    where: { id: poolId },
    data: { contractAddress },
  });

  console.log(`\nDeployed successfully:`);
  console.log(`  contractAddress:         ${contractAddress}`);
  console.log(`  poolJettonWalletAddress: ${poolJettonWalletAddress}`);
  console.log(`\nPool ${poolId} updated in DB. The user can now proceed to deposit reward tokens.`);
}

main()
  .catch((e) => { console.error('\nDeployment failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
