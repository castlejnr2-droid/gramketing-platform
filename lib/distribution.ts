import { prisma } from './prisma';

export interface Winner {
  walletAddress: string;
  userId: string;
  totalPoints: number;
  sharePercent: number;     // 0–100
  shareBasisPoints: number; // 0–10000 for contract
  tokenAmount: string;      // raw token units as string
}

export async function calculateDistribution(poolId: string): Promise<Winner[]> {
  const pool = await prisma.pool.findUniqueOrThrow({
    where: { id: poolId },
    include: {
      participants: {
        include: { user: true },
        orderBy: { totalPoints: 'desc' },
        take: 100, // fetch more than slots to filter zeros
      },
    },
  });

  const eligible = pool.participants
    .filter((p) => p.totalPoints > 0)
    .slice(0, pool.rewardSlots);

  if (eligible.length === 0) return [];

  const totalPoints = eligible.reduce((sum, p) => sum + p.totalPoints, 0);
  const totalRewardBigInt = BigInt(pool.totalReward);

  // Largest-remainder method: floors first, then distribute leftover bps
  // one-at-a-time to winners with the largest fractional parts.
  // This guarantees sum(shareBasisPoints) === 10000 exactly.
  const exactShares = eligible.map((p) => (p.totalPoints / totalPoints) * 10000);
  const floors = exactShares.map(Math.floor);
  const remainders = exactShares.map((exact, i) => exact - floors[i]);

  let leftover = 10000 - floors.reduce((a, b) => a + b, 0);

  // Sort indices by remainder descending, stable (preserve original order on tie)
  const order = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map(({ i }) => i);

  const bps = [...floors];
  for (let k = 0; k < leftover; k++) {
    bps[order[k]] += 1;
  }

  return eligible.map((p, i) => {
    const shareBasisPoints = bps[i];
    const sharePercent = (p.totalPoints / totalPoints) * 100;
    const tokenAmount = (
      (totalRewardBigInt * BigInt(shareBasisPoints)) /
      10000n
    ).toString();

    return {
      walletAddress: p.user.walletAddress,
      userId: p.userId,
      totalPoints: p.totalPoints,
      sharePercent,
      shareBasisPoints,
      tokenAmount,
    };
  });
}
