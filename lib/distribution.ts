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

  return eligible.map((p) => {
    const sharePercent = (p.totalPoints / totalPoints) * 100;
    const shareBasisPoints = Math.round((p.totalPoints / totalPoints) * 10000);
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
