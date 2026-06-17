/**
 * Checks for existing (poolId, postLink) duplicates in PoolPost before the
 * @@unique([poolId, postLink]) migration can be safely applied.
 *
 * Run with:
 *   DATABASE_URL=<your-neon-url> npx ts-node --transpile-only -P scripts/tsconfig.json scripts/_check-poolpost-dupes.ts
 *
 * Or with .env.local containing DATABASE_URL:
 *   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/_check-poolpost-dupes.ts
 *
 * READ-ONLY — no writes.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for (poolId, postLink) duplicates in PoolPost...\n');

  // Raw group-by query — Prisma's groupBy can do this directly
  const groups = await prisma.poolPost.groupBy({
    by: ['poolId', 'postLink'],
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
    orderBy: { _count: { id: 'desc' } },
  });

  if (groups.length === 0) {
    console.log('✓ No duplicates found. Safe to apply the @@unique migration.');
    return;
  }

  console.log(`✗ Found ${groups.length} duplicate (poolId, postLink) pair(s):\n`);
  console.log('  poolId                          | cnt | postLink');
  console.log('  ' + '-'.repeat(90));

  for (const g of groups) {
    console.log(`  ${g.poolId.padEnd(32)} | ${String(g._count.id).padStart(3)} | ${g.postLink}`);
  }

  console.log('\nDo NOT apply the migration until these are resolved.');
  console.log('Review each pair and decide which row(s) to keep, then delete the rest.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
