/**
 * Lists all PENDING pools and optionally deletes a specific one by ID.
 *
 * PENDING pools are created when the access fee is verified but reward tokens
 * haven't been deposited yet.  If the HTTP response was lost after DB write
 * the frontend may show an error while the DB has a PENDING pool, causing a
 * 409 "already used" on the next attempt with the same fee tx hash.
 *
 * Run (READ-ONLY — just lists):
 *   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/_check-pending-pools.ts
 *
 * Delete a specific PENDING pool (set DELETE_POOL_ID env var):
 *   DELETE_POOL_ID=clxxxxxxxx npx ts-node --transpile-only -P scripts/tsconfig.json scripts/_check-pending-pools.ts
 *
 * Or with .env (DATABASE_URL must be set):
 *   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/_check-pending-pools.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const deleteId = process.env.DELETE_POOL_ID;

  const pendingPools = await prisma.pool.findMany({
    where: { status: 'PENDING' },
    include: {
      project: { select: { name: true, ownerWalletAddress: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\nFound ${pendingPools.length} PENDING pool(s):\n`);

  for (const pool of pendingPools) {
    console.log(`  id:             ${pool.id}`);
    console.log(`  project:        ${pool.project?.name ?? '(none)'}`);
    console.log(`  owner:          ${pool.project?.ownerWalletAddress ?? '(none)'}`);
    console.log(`  tokenSymbol:    ${pool.tokenSymbol}`);
    console.log(`  accessFeeTxHash:${pool.accessFeeTxHash ?? '(null)'}`);
    console.log(`  createdAt:      ${pool.createdAt.toISOString()}`);
    console.log('');
  }

  if (!deleteId) {
    console.log('Set DELETE_POOL_ID=<id> to delete a specific PENDING pool and free its tx hash.');
    return;
  }

  const target = pendingPools.find((p) => p.id === deleteId);
  if (!target) {
    console.error(`ERROR: Pool ${deleteId} not found in PENDING list (wrong id or wrong status).`);
    process.exit(1);
  }

  console.log(`Deleting PENDING pool ${deleteId} (${target.project?.name}, tx: ${target.accessFeeTxHash})...`);
  // Delete dependent records first (FK constraints)
  await prisma.platformRevenue.deleteMany({ where: { poolId: deleteId } });
  await prisma.adminLog.deleteMany({ where: { poolId: deleteId } });
  await prisma.pool.delete({ where: { id: deleteId } });
  console.log('Deleted.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
