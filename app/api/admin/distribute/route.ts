import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet, isAdmin } from '@/lib/auth';
import { calculateDistribution } from '@/lib/distribution';
import { notifyRewardsDistributed } from '@/lib/telegram-notify';

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

    // Calculate distribution
    const winners = await calculateDistribution(poolId);

    if (winners.length === 0) {
      return NextResponse.json(
        { error: 'No eligible winners found' },
        { status: 400 }
      );
    }

    // TODO: Call smart contract distributeRewards via TON SDK
    // Build the winners map (Address -> shareBasisPoints)
    // and send DistributeRewards message to pool.contractAddress
    // Example using @ton/ton:
    //
    // const client = new TonClient({ endpoint: process.env.TON_ENDPOINT! });
    // const contract = client.open(Address.parse(pool.contractAddress!));
    // await contract.sendDistributeRewards(adminKeyPair, {
    //   winners: new Map(winners.map(w => [Address.parse(w.walletAddress), w.shareBasisPoints])),
    // });

    // Mark pool as distributed
    const updatedPool = await prisma.pool.update({
      where: { id: poolId },
      data: { status: 'DISTRIBUTED' },
      include: { project: true },
    });

    // Notify each winner
    const poolName = updatedPool.project.name;
    for (const winner of winners) {
      const tokenAmount = winner.tokenAmount ?? '0';
      notifyRewardsDistributed(winner.userId, poolName, tokenAmount).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      winners,
      totalWinners: winners.length,
      note: 'Smart contract call not yet implemented — pool marked DISTRIBUTED in DB',
    });
  } catch (err) {
    console.error('POST /api/admin/distribute error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
