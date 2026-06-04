import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { calculateDistribution } from '@/lib/distribution';
import { sendCancelPool } from '@/lib/gramketing-pool-contract';

export async function GET(req: NextRequest) {
  // Return cancellation preview without committing
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const poolId = searchParams.get('poolId');
    if (!poolId) return NextResponse.json({ error: 'Missing poolId' }, { status: 400 });

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });

    const preview = calculateProRata(pool);
    const allWinners = await calculateDistribution(poolId);
    const topWinners = allWinners.slice(0, pool.rewardSlots);

    // Compute each winner's pro-rata token amount for the preview
    const participantBasisPoints = Math.round(
      (preview.daysElapsed / preview.totalDays) * 10000,
    );
    const winnersPreview = topWinners.map((w, i) => ({
      rank: i + 1,
      walletAddress: w.walletAddress,
      totalPoints: w.totalPoints,
      proRataAmount: (
        (parseFloat(pool.totalReward) * w.shareBasisPoints * participantBasisPoints) /
        100_000_000
      ).toFixed(2),
    }));

    return NextResponse.json({ preview, winners: winnersPreview });
  } catch (err) {
    console.error('GET /api/admin/cancel-pool error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { poolId } = await req.json();
    if (!poolId) return NextResponse.json({ error: 'Missing poolId' }, { status: 400 });

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    if (pool.status === 'DISTRIBUTED') {
      return NextResponse.json({ error: 'Cannot cancel an already distributed pool' }, { status: 400 });
    }

    const proRata = calculateProRata(pool);

    // Get distribution plan capped to reward slots
    const allWinners = await calculateDistribution(poolId);
    const topWinners = allWinners.slice(0, pool.rewardSlots);

    // Scale each winner's share down by the participant fraction of elapsed time.
    // participantBasisPoints represents the fraction of the total reward the participants
    // collectively receive (daysElapsed / durationDays * 10000).
    const participantBasisPoints = Math.round(
      (proRata.daysElapsed / proRata.totalDays) * 10000,
    );
    const scaledWinners = topWinners.map(w => ({
      walletAddress: w.walletAddress,
      shareBasisPoints: Math.round(w.shareBasisPoints * participantBasisPoints / 10000),
    }));

    if (!pool.contractAddress) {
      return NextResponse.json({ error: 'Pool has no contract address' }, { status: 400 });
    }

    // Send CancelPool message to the smart contract.
    // The contract distributes scaled shares to winners and refunds the remainder to the owner.
    await sendCancelPool(pool.contractAddress, scaledWinners);

    await prisma.pool.update({ where: { id: poolId }, data: { status: 'DISTRIBUTED' } });

    return NextResponse.json({
      success: true,
      proRata,
      winners: topWinners,
    });
  } catch (err) {
    console.error('POST /api/admin/cancel-pool error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface PoolForProRata {
  startDate: Date;
  durationDays: number;
  totalReward: string;
}

export function calculateProRata(pool: PoolForProRata) {
  const now = new Date();
  const start = new Date(pool.startDate);
  const msElapsed = Math.max(0, now.getTime() - start.getTime());
  const daysElapsed = Math.min(msElapsed / (1000 * 60 * 60 * 24), pool.durationDays);
  const daysRemaining = pool.durationDays - daysElapsed;
  const totalReward = parseFloat(pool.totalReward);
  const dailyRate = totalReward / pool.durationDays;
  const participantTokens = dailyRate * daysElapsed;
  const refundTokens = dailyRate * daysRemaining;

  return {
    daysElapsed: Math.round(daysElapsed * 10) / 10,
    daysRemaining: Math.round(daysRemaining * 10) / 10,
    totalDays: pool.durationDays,
    dailyRate: Math.round(dailyRate * 100) / 100,
    participantTokens: Math.round(participantTokens * 100) / 100,
    refundTokens: Math.round(refundTokens * 100) / 100,
  };
}
