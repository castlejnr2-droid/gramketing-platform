import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch all participations with pool details
    const participations = await prisma.poolParticipant.findMany({
      where: { userId: user.id },
      include: {
        pool: {
          include: {
            project: { select: { name: true } },
            participants: {
              orderBy: { totalPoints: 'desc' },
              select: { userId: true, totalPoints: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const activePools = [];
    const endedPools = [];

    for (const p of participations) {
      // Determine rank
      const sortedParticipants = p.pool.participants;
      const rank =
        sortedParticipants.findIndex((sp) => sp.userId === user.id) + 1;

      const poolData = {
        poolId: p.pool.id,
        poolStatus: p.pool.status,
        projectName: p.pool.project.name,
        tokenSymbol: p.pool.tokenSymbol,
        totalReward: p.pool.totalReward,
        endDate: p.pool.endDate,
        rank,
        totalParticipants: sortedParticipants.length,
        totalPoints: p.totalPoints,
        referralCode: p.referralCode,
        referralBonusPoints: p.referralBonusPoints,
      };

      if (p.pool.status === 'ACTIVE') {
        activePools.push(poolData);
      } else {
        endedPools.push(poolData);
      }
    }

    return NextResponse.json({
      account: {
        walletAddress: user.walletAddress,
        username: user.username,
        xHandle: user.xHandle,
        telegramChannelUrl: user.telegramChannelUrl,
        telegramChatId: user.telegramChatId,
      },
      activePools,
      endedPools,
    });
  } catch (err) {
    console.error('GET /api/dashboard error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
