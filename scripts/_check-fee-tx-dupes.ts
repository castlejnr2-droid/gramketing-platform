/**
 * Checks for existing duplicate non-null accessFeeTxHash values in Pool before
 * the @unique constraint migration can be safely applied.
 *
 * Run with:
 *   DATABASE_URL=<your-neon-url> npx ts-node --transpile-only -P scripts/tsconfig.json scripts/_check-fee-tx-dupes.ts
 *
 * Or with .env.local containing DATABASE_URL:
 *   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/_check-fee-tx-dupes.ts
 *
 * READ-ONLY — no writes.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for duplicate non-null accessFeeTxHash values in Pool...\n');

  const groups = await prisma.pool.groupBy({
    by: ['accessFeeTxHash'],
    where: { accessFeeTxHash: { not: null } },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
    orderBy: { _count: { id: 'desc' } },
  });

  if (groups.length === 0) {
    console.log('✓ No duplicate accessFeeTxHash values found. Safe to apply the @unique migration.');
    return;
  }

  console.log(`✗ Found ${groups.length} duplicate accessFeeTxHash value(s):\n`);
  console.log('  cnt | txHash');
  console.log('  ' + '-'.repeat(80));

  for (const g of groups) {
    console.log(`  ${String(g._count.id).padStart(3)} | ${g.accessFeeTxHash}`);
  }

  console.log('\nDo NOT apply the @unique migration until these are resolved.');
  console.log('Review each group and decide which pool(s) to keep, then nullify or delete the rest.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
