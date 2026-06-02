import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { poolId: string } }
) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedUserId = searchParams.get('userId');

    const authUser = await prisma.user.findUniqueOrThrow({
      where: { walletAddress },
    });

    // Determine which user's submissions to return
    const targetUserId = requestedUserId ?? authUser.id;

    const submissions = await prisma.submission.findMany({
      where: {
        poolId: params.poolId,
        userId: targetUserId,
      },
      orderBy: { submittedAt: 'desc' },
    });

    // Get participant stats for the auth user
    let myStats = null;
    const participant = await prisma.poolParticipant.findUnique({
      where: {
        poolId_userId: {
          poolId: params.poolId,
          userId: authUser.id,
        },
      },
    });

    if (participant) {
      myStats = {
        totalPoints: participant.totalPoints,
        xPoints: participant.xPoints,
        telegramPoints: participant.telegramPoints,
        referralBonusPoints: participant.referralBonusPoints,
        referralMultiplier: participant.referralMultiplier,
        holderBoost: participant.holderBoost,
        referralCode: participant.referralCode,
        successfulReferrals: await prisma.referralBoost.count({
          where: { referrerId: authUser.id, poolId: params.poolId },
        }),
      };
    }

    return NextResponse.json({ submissions, myStats });
  } catch (err) {
    console.error('GET /api/submissions/[poolId] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
