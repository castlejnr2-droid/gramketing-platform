import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id: poolId, userId } = await params;

    const participant = await prisma.poolParticipant.findUnique({
      where: { poolId_userId: { poolId, userId } },
      include: {
        user: {
          select: {
            id: true,
            walletAddress: true,
            username: true,
            xHandle: true,
            telegramHandle: true,
          },
        },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
    }

    // Rank among all participants
    const allParticipants = await prisma.poolParticipant.findMany({
      where: { poolId },
      orderBy: { totalPoints: 'desc' },
      select: { userId: true },
    });
    const rank = allParticipants.findIndex((p) => p.userId === userId) + 1;

    // Use PoolPost records (live scrape data) for accurate per-post metrics
    const poolPosts = await prisma.poolPost.findMany({
      where: { participantId: participant.id },
      orderBy: { submittedAt: 'desc' },
    });

    // Referral boosts - who they referred and their holdings
    const referralBoosts = await prisma.referralBoost.findMany({
      where: { referrerId: userId, poolId },
      include: {
        referred: { select: { walletAddress: true, username: true, xHandle: true } },
      },
    });

    const pool = await prisma.pool.findUnique({
      where: { id: poolId },
      select: { campaignType: true },
    });

    return NextResponse.json({
      participant: {
        userId: participant.userId,
        walletAddress: participant.user.walletAddress,
        username: participant.user.username,
        xHandle: participant.user.xHandle,
        telegramHandle: participant.user.telegramHandle,
        totalPoints: participant.totalPoints,
        xPoints: participant.xPoints,
        telegramPoints: participant.telegramPoints,
        referralBonusPoints: participant.referralBonusPoints,
        holderBoost: participant.holderBoost,
        referralMultiplier: participant.referralMultiplier,
        referralCode: participant.referralCode,
        joinedAt: participant.joinedAt,
        rank,
        totalParticipants: allParticipants.length,
      },
      // Map PoolPost fields to the shape Leaderboard modal expects
      submissions: poolPosts.map((p) => ({
        id: p.id,
        platform: p.platform,
        postUrl: p.postLink,
        currentViews: p.views,
        likes: p.likes,
        reposts: p.reposts,
        reactions: p.reactions,
        currentPoints: p.points,
        status: 'VERIFIED',
        submittedAt: p.submittedAt,
        lastScrapedAt: p.lastScrapedAt,
        scrapeError: p.scrapeError ?? null,
      })),
      referralBoosts: referralBoosts.map((b) => ({
        referredWallet: b.referred.walletAddress,
        referredUsername: b.referred.username,
        referredXHandle: b.referred.xHandle,
        referredHolding: b.referredHolding.toString(),
      })),
      pool: {
        campaignType: pool?.campaignType ?? 'both',
      },
    });
  } catch (err) {
    console.error('GET /api/pools/[id]/participant/[userId] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
