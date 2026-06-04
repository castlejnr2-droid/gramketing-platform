import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthWallet } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedUserId = searchParams.get('userId');

    const authUser = await prisma.user.findUniqueOrThrow({ where: { walletAddress } });

    const targetUserId = requestedUserId ?? authUser.id;

    // Find the participant for the target user in this pool
    const targetParticipant = await prisma.poolParticipant.findUnique({
      where: { poolId_userId: { poolId, userId: targetUserId } },
    });

    // Return their PoolPost records
    const poolPosts = targetParticipant
      ? await prisma.poolPost.findMany({
          where: { participantId: targetParticipant.id },
          orderBy: { submittedAt: 'desc' },
        })
      : [];

    // Map to the shape the frontend expects
    const submissions = poolPosts.map((p) => ({
      id: p.id,
      platform: p.platform,
      postUrl: p.postLink,
      views: p.views,
      likes: p.likes,
      reposts: p.reposts,
      reactions: p.reactions,
      points: p.points,
      submittedAt: p.submittedAt.toISOString(),
      lastScrapedAt: p.lastScrapedAt?.toISOString() ?? null,
    }));

    // Participant stats for the auth user
    let myStats = null;
    const authParticipant = await prisma.poolParticipant.findUnique({
      where: { poolId_userId: { poolId, userId: authUser.id } },
    });

    if (authParticipant) {
      myStats = {
        totalPoints: authParticipant.totalPoints,
        xPoints: authParticipant.xPoints,
        telegramPoints: authParticipant.telegramPoints,
        referralBonusPoints: authParticipant.referralBonusPoints,
        referralMultiplier: authParticipant.referralMultiplier,
        holderBoost: authParticipant.holderBoost,
        referralCode: authParticipant.referralCode,
        successfulReferrals: await prisma.referralBoost.count({
          where: { referrerId: authUser.id, poolId },
        }),
      };
    }

    return NextResponse.json({ submissions, myStats });
  } catch (err) {
    console.error('GET /api/submissions/[poolId] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
