import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { calculateDistribution } from '@/lib/distribution';
import { notifyRewardsDistributed } from '@/lib/telegram-notify';
import { sendDistributeRewards } from '@/lib/gramketing-pool-contract';
import { logAdminEvent } from '@/lib/admin-log';

export async function POST(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress || !isAdmin(walletAddress)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { poolId } = await req.json();
    if (!poolId) {
      return NextResponse.json({ error: 'Missing poolId' }, { status: 400 });
    }

    const pool = await prisma.pool.findUnique({ where: { id: poolId } });
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    if (pool.status === 'DISTRIBUTED') {
      return NextResponse.json(
        { error: 'Pool already distributed' },
        { status: 400 }
      );
    }

    if (!pool.contractAddress) {
      const msg = 'Pool has no deployed contract address — cannot distribute on-chain';
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS',
        level: 'error',
        poolId,
        message: msg,
      });
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Calculate distribution
    let winners;
    try {
      winners = await calculateDistribution(poolId);
    } catch (calcErr) {
      const errMsg = calcErr instanceof Error ? calcErr.message : String(calcErr);
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS',
        level: 'error',
        poolId,
        message: `Distribution calculation failed: ${errMsg}`,
        details: { error: errMsg },
      });
      return NextResponse.json({ error: `Distribution calculation failed: ${errMsg}` }, { status: 500 });
    }

    if (winners.length === 0) {
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS',
        level: 'warn',
        poolId,
        message: 'Distribution aborted — no eligible winners (all participants have 0 points)',
      });
      return NextResponse.json(
        { error: 'No eligible winners found' },
        { status: 400 }
      );
    }

    // Send DistributeRewards message to the on-chain escrow contract
    try {
      await sendDistributeRewards(
        pool.contractAddress,
        winners.map((w) => ({
          walletAddress: w.walletAddress,
          shareBasisPoints: w.shareBasisPoints,
        })),
      );
    } catch (chainErr) {
      const errMsg = chainErr instanceof Error ? chainErr.message : String(chainErr);
      await logAdminEvent({
        action: 'DISTRIBUTE_REWARDS',
        level: 'error',
        poolId,
        message: `On-chain DistributeRewards transaction failed: ${errMsg}`,
        details: {
          error: errMsg,
          contractAddress: pool.contractAddress,
          winnerCount: winners.length,
        },
      });
      return NextResponse.json(
        { error: `On-chain distribution failed: ${errMsg}` },
        { status: 502 }
      );
    }

    // Mark pool as distributed in DB (only after successful on-chain tx)
    const updatedPool = await prisma.pool.update({
      where: { id: poolId },
      data: { status: 'DISTRIBUTED' },
      include: { project: true },
    });

    await logAdminEvent({
      action: 'DISTRIBUTE_REWARDS',
      level: 'info',
      poolId,
      message: `Distribution complete — ${winners.length} winner(s) paid from contract ${pool.contractAddress}`,
      details: {
        contractAddress: pool.contractAddress,
        winnerCount: winners.length,
        winners: winners.map((w) => ({
          wallet: w.walletAddress,
          basisPoints: w.shareBasisPoints,
          tokenAmount: w.tokenAmount,
        })),
      },
    });

    // Notify each winner (fire-and-forget)
    const poolName = updatedPool.project.name;
    for (const winner of winners) {
      const tokenAmount = winner.tokenAmount ?? '0';
      notifyRewardsDistributed(winner.userId, poolName, tokenAmount).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      winners,
      totalWinners: winners.length,
    });
  } catch (err) {
    console.error('POST /api/admin/distribute error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
