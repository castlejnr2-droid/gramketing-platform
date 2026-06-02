import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { calculateDistribution } from '@/lib/distribution';

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
    return NextResponse.json({ preview });
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

    // Get distribution plan for participant share
    const winners = await calculateDistribution(poolId);
    const participantShare = proRata.participantTokens;
    const refundShare = proRata.refundTokens;

    await prisma.pool.update({ where: { id: poolId }, data: { status: 'ENDED' } });

    // TODO: Call smart contract cancelPool with pro-rata split via TON SDK:
    // 1. Send participantTokens to escrow, trigger distributeRewards with winner shares
    // 2. Send refundTokens back to project owner wallet
    // Access fee paid to treasury is never refunded.

    return NextResponse.json({
      success: true,
      proRata,
      winners: winners.slice(0, pool.rewardSlots),
      note: 'Pool cancelled with pro-rata split. Smart contract calls not yet implemented.',
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
    accessFeeRefunded: false,
  };
}
